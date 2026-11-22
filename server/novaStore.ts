import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

export const WORKSPACE_ROOT = path.resolve(process.cwd());
export const NOVA_DATA_DIR = path.join(WORKSPACE_ROOT, '.nova-data');
const SNAPSHOTS_DIR = path.join(NOVA_DATA_DIR, 'snapshots');
const VAULT_KEY_PATH = path.join(NOVA_DATA_DIR, '.vault.key');
const STATE_FILES = {
  connectors: path.join(NOVA_DATA_DIR, 'connectors.json'),
  scheduler: path.join(NOVA_DATA_DIR, 'scheduler.json'),
  audit: path.join(NOVA_DATA_DIR, 'audit.json'),
  control: path.join(NOVA_DATA_DIR, 'control.json'),
  notifications: path.join(NOVA_DATA_DIR, 'notifications.json'),
};

function ensureDataDirs() {
  if (!fs.existsSync(NOVA_DATA_DIR)) {
    fs.mkdirSync(NOVA_DATA_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true, mode: 0o700 });
  }
}

let cachedVaultKey: Buffer | null = null;

function getVaultKey(): Buffer {
  if (cachedVaultKey) return cachedVaultKey;
  ensureDataDirs();
  const envSecret = process.env.NOVA_VAULT_SECRET;
  if (envSecret && envSecret.length >= 16) {
    cachedVaultKey = crypto.createHash('sha256').update(envSecret).digest();
    return cachedVaultKey;
  }
  if (fs.existsSync(VAULT_KEY_PATH)) {
    const raw = fs.readFileSync(VAULT_KEY_PATH, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      cachedVaultKey = Buffer.from(raw, 'hex');
      return cachedVaultKey;
    }
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(VAULT_KEY_PATH, key.toString('hex'), { mode: 0o600 });
  cachedVaultKey = key;
  return cachedVaultKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const parts = String(payload || '').split(':');
  if (parts.length !== 3) return '';
  const [ivB64, tagB64, dataB64] = parts;
  const key = getVaultKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  ensureDataDirs();
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDataDirs();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ---------- Path Confinement (Code Agent & File Ops) ----------
const FORBIDDEN_WORKSPACE_PREFIXES = ['.env', '.nova-data', '.git', 'node_modules', 'dist', 'dev-dist'];

export function resolveSafeWorkspacePath(relPath: string): { ok: true; absPath: string; relPath: string } | { ok: false; error: string } {
  const cleaned = String(relPath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('\0')) {
    return { ok: false, error: 'Invalid file path.' };
  }
  const resolved = path.resolve(WORKSPACE_ROOT, cleaned);
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
    return { ok: false, error: 'Path escapes project workspace.' };
  }
  const normalizedRel = path.relative(WORKSPACE_ROOT, resolved).replace(/\\/g, '/');
  const firstSeg = normalizedRel.split('/')[0];
  if (FORBIDDEN_WORKSPACE_PREFIXES.some((p) => firstSeg === p || normalizedRel.startsWith(p))) {
    return { ok: false, error: `Access to protected path "${normalizedRel}" is denied.` };
  }
  if (fs.existsSync(resolved)) {
    try {
      const real = fs.realpathSync(resolved);
      if (real !== WORKSPACE_ROOT && !real.startsWith(WORKSPACE_ROOT + path.sep)) {
        return { ok: false, error: 'Symlink target escapes project workspace.' };
      }
    } catch {
      return { ok: false, error: 'Unable to resolve workspace path.' };
    }
  }
  return { ok: true, absPath: resolved, relPath: normalizedRel };
}

// ---------- SSRF Validation (Computer Use, Research URL Fetch, MCP/API Connectors) ----------
function isPrivateIpAddress(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const parts = v4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function validateExternalHttpUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; error: string } {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'Only http:// and https:// URLs are permitted.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal' ||
      isPrivateIpAddress(host)
    ) {
      return { ok: false, error: 'Access to private, loopback, or metadata hosts is blocked.' };
    }
    return { ok: true, url: parsed };
  } catch {
    return { ok: false, error: 'Invalid URL format.' };
  }
}

// ---------- Audit Log & Control Governance ----------
export type PermissionMode = 'auto' | 'ask' | 'deny';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  timestampMs: number;
  module: string;
  action: string;
  actor: string;
  outcome: 'allowed' | 'blocked' | 'pending' | 'error' | 'executed';
  details: string;
}

export interface PendingApprovalItem {
  id: string;
  module: 'code' | 'computer' | 'connect' | 'scheduler';
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: 'pending' | 'approved' | 'cancelled';
}

export interface ControlState {
  toolPermissions: Record<string, PermissionMode>;
  rateLimitMaxPerMinute: number;
  pendingApprovals: PendingApprovalItem[];
}

const DEFAULT_CONTROL_STATE: ControlState = {
  toolPermissions: {
    'code.read': 'auto',
    'code.write': 'ask',
    'code.terminal': 'ask',
    'code.github': 'ask',
    'computer.fetch': 'ask',
    'computer.form': 'ask',
    'connect.mcp': 'ask',
    'connect.github': 'ask',
    'connect.rest': 'ask',
    'scheduler.run': 'auto',
    'research.web': 'auto',
  },
  rateLimitMaxPerMinute: 90,
  pendingApprovals: [],
};

export function getControlState(): ControlState {
  const loaded = readJsonFile<ControlState>(STATE_FILES.control, DEFAULT_CONTROL_STATE);
  return {
    toolPermissions: { ...DEFAULT_CONTROL_STATE.toolPermissions, ...(loaded.toolPermissions ?? {}) },
    rateLimitMaxPerMinute: Number(loaded.rateLimitMaxPerMinute) || 90,
    pendingApprovals: Array.isArray(loaded.pendingApprovals) ? loaded.pendingApprovals.slice(0, 40) : [],
  };
}

export function saveControlState(next: ControlState): void {
  writeJsonFile(STATE_FILES.control, {
    ...next,
    pendingApprovals: next.pendingApprovals.slice(0, 40),
  });
}

export function getToolPermission(toolKey: string): PermissionMode {
  const ctrl = getControlState();
  return ctrl.toolPermissions[toolKey] ?? 'ask';
}

export function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'timestampMs'>): AuditLogEntry {
  const logs = readJsonFile<AuditLogEntry[]>(STATE_FILES.audit, []);
  const created: AuditLogEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestampMs: Date.now(),
    ...entry,
    details: String(entry.details || '').slice(0, 400),
  };
  logs.unshift(created);
  if (logs.length > 200) logs.length = 200;
  writeJsonFile(STATE_FILES.audit, logs);
  return created;
}

export function getAuditLogs(): AuditLogEntry[] {
  return readJsonFile<AuditLogEntry[]>(STATE_FILES.audit, []);
}

// ---------- Sliding-Window Rate Limiter ----------
const rateBuckets = new Map<string, number[]>();
export const rateLimitTelemetry = {
  blockedCount: 0,
  totalChecked: 0,
  lastWindowRequests: 0,
};

export function checkSlidingWindowRateLimit(clientKey: string): {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
} {
  const ctrl = getControlState();
  const limit = Math.max(20, Math.min(300, ctrl.rateLimitMaxPerMinute || 90));
  const now = Date.now();
  const windowMs = 60_000;
  const existing = (rateBuckets.get(clientKey) ?? []).filter((ts) => now - ts < windowMs);
  rateLimitTelemetry.totalChecked += 1;

  if (existing.length >= limit) {
    rateBuckets.set(clientKey, existing);
    rateLimitTelemetry.blockedCount += 1;
    rateLimitTelemetry.lastWindowRequests = existing.length;
    const oldest = existing[0] ?? now;
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  existing.push(now);
  rateBuckets.set(clientKey, existing);
  rateLimitTelemetry.lastWindowRequests = existing.length;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.length),
    resetSeconds: 60,
  };
}

// ---------- Code Agent Rollback Snapshots ----------
export interface CodeSnapshot {
  id: string;
  createdAt: string;
  summary: string;
  files: Array<{
    path: string;
    existed: boolean;
    previousContent: string;
    newContent: string;
  }>;
}

export function saveCodeSnapshot(snapshot: Omit<CodeSnapshot, 'id' | 'createdAt'>): CodeSnapshot {
  ensureDataDirs();
  const created: CodeSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toLocaleString(),
    ...snapshot,
  };
  writeJsonFile(path.join(SNAPSHOTS_DIR, `${created.id}.json`), created);
  return created;
}

export function listCodeSnapshots(): Array<Pick<CodeSnapshot, 'id' | 'createdAt' | 'summary'> & { fileCount: number }> {
  ensureDataDirs();
  try {
    const names = fs.readdirSync(SNAPSHOTS_DIR).filter((n) => n.endsWith('.json')).sort().reverse();
    return names.slice(0, 25).map((n) => {
      const snap = readJsonFile<CodeSnapshot | null>(path.join(SNAPSHOTS_DIR, n), null);
      if (!snap) return null;
      return {
        id: snap.id,
        createdAt: snap.createdAt,
        summary: snap.summary,
        fileCount: snap.files.length,
      };
    }).filter((x): x is NonNullable<typeof x> => Boolean(x));
  } catch {
    return [];
  }
}

export function loadCodeSnapshot(id: string): CodeSnapshot | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return readJsonFile<CodeSnapshot | null>(path.join(SNAPSHOTS_DIR, `${id}.json`), null);
}

// ---------- Connectors Registry (Encrypted Secrets) ----------
export type ConnectorKind = 'mcp' | 'github' | 'rest_api' | 'database';

export interface StoredConnector {
  id: string;
  name: string;
  kind: ConnectorKind;
  endpointUrl: string;
  description: string;
  encryptedSecret?: string;
  headerName?: string;
  permissionMode: PermissionMode;
  status: 'connected' | 'untested' | 'error';
  lastCheckedAt?: string;
  lastError?: string;
  discoveredTools?: Array<{ name: string; description?: string }>;
}

export type PublicConnectorView = Omit<StoredConnector, 'encryptedSecret'> & {
  hasSecret: boolean;
};

const DEFAULT_CONNECTORS: StoredConnector[] = [
  {
    id: 'conn-github-default',
    name: 'GitHub REST Workspace',
    kind: 'github',
    endpointUrl: 'https://api.github.com',
    description: 'Inspect authorized repositories, issues, and commit approved file updates.',
    headerName: 'Authorization',
    permissionMode: 'ask',
    status: 'untested',
  },
];

export function listConnectorsRaw(): StoredConnector[] {
  const list = readJsonFile<StoredConnector[]>(STATE_FILES.connectors, DEFAULT_CONNECTORS);
  return Array.isArray(list) ? list : DEFAULT_CONNECTORS;
}

export function listConnectorsPublic(): PublicConnectorView[] {
  return listConnectorsRaw().map(({ encryptedSecret, ...rest }) => ({
    ...rest,
    hasSecret: Boolean(encryptedSecret),
  }));
}

export function upsertConnector(input: {
  id?: string;
  name: string;
  kind: ConnectorKind;
  endpointUrl: string;
  description?: string;
  secretToken?: string;
  headerName?: string;
  permissionMode?: PermissionMode;
}): PublicConnectorView {
  const list = listConnectorsRaw();
  const id = input.id && /^[a-zA-Z0-9_-]+$/.test(input.id)
    ? input.id
    : `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const existingIdx = list.findIndex((c) => c.id === id);
  const existing = existingIdx >= 0 ? list[existingIdx] : undefined;

  const updated: StoredConnector = {
    id,
    name: String(input.name || 'Custom Connector').trim().slice(0, 80),
    kind: input.kind,
    endpointUrl: String(input.endpointUrl || '').trim().slice(0, 300),
    description: String(input.description || '').trim().slice(0, 240),
    headerName: String(input.headerName || existing?.headerName || 'Authorization').trim().slice(0, 60),
    permissionMode: input.permissionMode ?? existing?.permissionMode ?? 'ask',
    status: existing?.status ?? 'untested',
    lastCheckedAt: existing?.lastCheckedAt,
    lastError: existing?.lastError,
    discoveredTools: existing?.discoveredTools,
    encryptedSecret:
      typeof input.secretToken === 'string' && input.secretToken.trim().length > 0
        ? encryptSecret(input.secretToken.trim())
        : existing?.encryptedSecret,
  };

  if (existingIdx >= 0) {
    list[existingIdx] = updated;
  } else {
    list.unshift(updated);
  }
  writeJsonFile(STATE_FILES.connectors, list);
  const { encryptedSecret, ...pub } = updated;
  return { ...pub, hasSecret: Boolean(encryptedSecret) };
}

export function updateConnectorMeta(id: string, patch: Partial<StoredConnector>): PublicConnectorView | null {
  const list = listConnectorsRaw();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  writeJsonFile(STATE_FILES.connectors, list);
  const { encryptedSecret, ...pub } = list[idx];
  return { ...pub, hasSecret: Boolean(encryptedSecret) };
}

export function deleteConnector(id: string): boolean {
  const list = listConnectorsRaw();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  writeJsonFile(STATE_FILES.connectors, next);
  return true;
}

export function getConnectorSecret(id: string): string {
  const conn = listConnectorsRaw().find((c) => c.id === id);
  if (!conn?.encryptedSecret) return '';
  try {
    return decryptSecret(conn.encryptedSecret);
  } catch {
    return '';
  }
}

// ---------- Persistent Backend Scheduler ----------
export type ScheduleCadence = 'once' | 'hourly' | 'daily' | 'weekly' | 'cron';
export type ScheduleJobKind = 'daily_summary' | 'weekly_report' | 'scheduled_research' | 'task_reminder';

export interface ScheduledJobRun {
  id: string;
  ranAt: string;
  ok: boolean;
  outputSummary: string;
}

export interface ScheduledJob {
  id: string;
  title: string;
  kind: ScheduleJobKind;
  prompt: string;
  cadence: ScheduleCadence;
  cronExpr?: string;
  enabled: boolean;
  nextRunAtMs: number;
  lastRunAt?: string;
  lastResult?: string;
  runCount: number;
  history: ScheduledJobRun[];
  createdAt: string;
}

export interface SchedulerNotification {
  id: string;
  jobId: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export function computeNextRunMs(cadence: ScheduleCadence, fromMs = Date.now(), cronExpr?: string): number {
  if (cadence === 'hourly') return fromMs + 60 * 60 * 1000;
  if (cadence === 'daily') return fromMs + 24 * 60 * 60 * 1000;
  if (cadence === 'weekly') return fromMs + 7 * 24 * 60 * 60 * 1000;
  if (cadence === 'cron' && cronExpr) {
    // Support interval expressions like */N * * * * or HH MM * * *
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length >= 2) {
      const minPart = parts[0];
      const hourPart = parts[1];
      if (minPart.startsWith('*/')) {
        const mins = Math.max(1, parseInt(minPart.slice(2), 10) || 15);
        return fromMs + mins * 60 * 1000;
      }
      const targetMin = parseInt(minPart, 10);
      const targetHour = parseInt(hourPart, 10);
      if (!Number.isNaN(targetMin) && !Number.isNaN(targetHour)) {
        const next = new Date(fromMs);
        next.setHours(targetHour % 24, targetMin % 60, 0, 0);
        if (next.getTime() <= fromMs) next.setDate(next.getDate() + 1);
        return next.getTime();
      }
    }
    return fromMs + 60 * 60 * 1000;
  }
  return fromMs + 5 * 60 * 1000;
}

export function listScheduledJobs(): ScheduledJob[] {
  return readJsonFile<ScheduledJob[]>(STATE_FILES.scheduler, []);
}

export function saveScheduledJobs(jobs: ScheduledJob[]): void {
  writeJsonFile(STATE_FILES.scheduler, jobs.slice(0, 60));
}

export function listSchedulerNotifications(): SchedulerNotification[] {
  return readJsonFile<SchedulerNotification[]>(STATE_FILES.notifications, []);
}

export function saveSchedulerNotifications(items: SchedulerNotification[]): void {
  writeJsonFile(STATE_FILES.notifications, items.slice(0, 80));
}

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerRunningTick = false;

export async function executeScheduledJobById(
  jobId: string,
  aiFactory: () => GoogleGenAI | null
): Promise<ScheduledJob | null> {
  const jobs = listScheduledJobs();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx === -1) return null;
  const job = jobs[idx];
  const ranAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let output = '';
  let ok = true;
  try {
    const ai = aiFactory();
    if (ai && job.kind !== 'task_reminder') {
      const useSearch = job.kind === 'scheduled_research';
      const resp = await ai.models.generateContent({
        model: useSearch ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite',
        contents: `Execute this scheduled Nova ${job.kind.replace('_', ' ')} task concisely with clear takeaways:\n\nTitle: ${job.title}\nInstructions: ${job.prompt}`,
        config: {
          systemInstruction:
            'You are Nova Autonomous Background Scheduler. Deliver crisp, actionable summaries or verified research findings.',
          ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      output = (resp.text ?? '').trim() || `Completed "${job.title}".`;
    } else {
      output = `Reminder triggered: ${job.title}${job.prompt ? ` — ${job.prompt}` : ''}`;
    }
  } catch (err) {
    ok = false;
    output = err instanceof Error ? err.message : 'Scheduled execution error';
  }

  const runEntry: ScheduledJobRun = {
    id: `run-${Date.now()}`,
    ranAt,
    ok,
    outputSummary: output.slice(0, 1200),
  };

  const nextMs =
    job.cadence === 'once'
      ? job.nextRunAtMs
      : computeNextRunMs(job.cadence, Date.now(), job.cronExpr);

  const updatedJob: ScheduledJob = {
    ...job,
    enabled: job.cadence === 'once' ? false : job.enabled,
    nextRunAtMs: nextMs,
    lastRunAt: ranAt,
    lastResult: output.slice(0, 1200),
    runCount: job.runCount + 1,
    history: [runEntry, ...job.history].slice(0, 20),
  };

  jobs[idx] = updatedJob;
  saveScheduledJobs(jobs);

  const notifs = listSchedulerNotifications();
  notifs.unshift({
    id: `notif-${Date.now()}`,
    jobId: job.id,
    title: `${ok ? 'Completed' : 'Alert'}: ${job.title}`,
    body: output.slice(0, 320),
    createdAt: ranAt,
    read: false,
  });
  saveSchedulerNotifications(notifs);

  appendAuditLog({
    module: 'scheduler',
    action: `run:${job.kind}`,
    actor: 'nova-scheduler-daemon',
    outcome: ok ? 'executed' : 'error',
    details: `${job.title} -> ${output.slice(0, 140)}`,
  });

  return updatedJob;
}

export function startBackendScheduler(aiFactory: () => GoogleGenAI | null): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(async () => {
    if (schedulerRunningTick) return;
    schedulerRunningTick = true;
    try {
      const now = Date.now();
      const jobs = listScheduledJobs();
      const due = jobs.filter((j) => j.enabled && j.nextRunAtMs <= now);
      for (const job of due) {
        await executeScheduledJobById(job.id, aiFactory);
      }
    } catch {
      // keep background daemon resilient
    } finally {
      schedulerRunningTick = false;
    }
  }, 15_000);
}
