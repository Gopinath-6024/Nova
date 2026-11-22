import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import express, { type Request, type Response, type Router } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  WORKSPACE_ROOT,
  appendAuditLog,
  checkSlidingWindowRateLimit,
  computeNextRunMs,
  deleteConnector,
  executeScheduledJobById,
  getAuditLogs,
  getConnectorSecret,
  getControlState,
  getToolPermission,
  listCodeSnapshots,
  listConnectorsPublic,
  listConnectorsRaw,
  listScheduledJobs,
  listSchedulerNotifications,
  loadCodeSnapshot,
  rateLimitTelemetry,
  resolveSafeWorkspacePath,
  saveCodeSnapshot,
  saveControlState,
  saveScheduledJobs,
  saveSchedulerNotifications,
  updateConnectorMeta,
  upsertConnector,
  validateExternalHttpUrl,
  type PermissionMode,
  type ScheduledJob,
  type ScheduleCadence,
  type ScheduleJobKind,
} from '../novaStore';

const execFileAsync = promisify(execFile);

export interface EcosystemRouteDeps {
  getAiClient: (apiVersion?: string) => GoogleGenAI;
  tryGetAiClient: () => GoogleGenAI | null;
  getGeminiErrorStatus: (err: unknown) => { status: number; message: string; paidKeyRequired?: boolean };
  recordApiTelemetry: (
    endpoint: string,
    model: string,
    status: number,
    latencyMs: number,
    ok: boolean,
    message: string
  ) => void;
}

// ---------- Helpers ----------
function walkWorkspaceFiles(dir: string, acc: Array<{ path: string; size: number; ext: string }> = [], depth = 0) {
  if (depth > 6 || acc.length >= 250) return acc;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'dev-dist', '.git', '.nova-data']);
  for (const entry of entries) {
    if (acc.length >= 250) break;
    if (entry.name.startsWith('.env')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walkWorkspaceFiles(full, acc, depth + 1);
      }
    } else if (entry.isFile()) {
      const rel = path.relative(WORKSPACE_ROOT, full).replace(/\\/g, '/');
      const ext = path.extname(entry.name).toLowerCase();
      try {
        const stat = fs.statSync(full);
        acc.push({ path: rel, size: stat.size, ext });
      } catch {
        // skip unreadable file
      }
    }
  }
  return acc;
}

function extractFileImports(absPath: string): string[] {
  const ext = path.extname(absPath).toLowerCase();
  if (!['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) return [];
  try {
    const content = fs.readFileSync(absPath, 'utf8').slice(0, 16000);
    const imports: string[] = [];
    const regex = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      imports.push(m[1]);
    }
    return Array.from(new Set(imports)).slice(0, 20);
  } catch {
    return [];
  }
}

function computeLineDiff(oldText: string, newText: string): {
  added: number;
  removed: number;
  hunks: Array<{ type: 'same' | 'add' | 'remove'; text: string; oldLine?: number; newLine?: number }>;
} {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  const hunks: Array<{ type: 'same' | 'add' | 'remove'; text: string; oldLine?: number; newLine?: number }> = [];
  let added = 0;
  let removed = 0;

  // Compact Myers-style sliding match for clear diff visualization without O(N*M) blowup
  let oi = 0;
  let ni = 0;
  let guard = 0;
  while ((oi < oldLines.length || ni < newLines.length) && guard < maxLen + 4000) {
    guard++;
    const ol = oldLines[oi];
    const nl = newLines[ni];
    if (oi < oldLines.length && ni < newLines.length && ol === nl) {
      hunks.push({ type: 'same', text: ol, oldLine: oi + 1, newLine: ni + 1 });
      oi++;
      ni++;
    } else {
      // Lookahead window up to 8 lines to realign
      let foundOldInNew = -1;
      let foundNewInOld = -1;
      for (let k = 1; k <= 8; k++) {
        if (ni + k < newLines.length && oi < oldLines.length && newLines[ni + k] === ol) {
          foundOldInNew = k;
          break;
        }
        if (oi + k < oldLines.length && ni < newLines.length && oldLines[oi + k] === nl) {
          foundNewInOld = k;
          break;
        }
      }

      if (foundOldInNew > 0) {
        for (let k = 0; k < foundOldInNew; k++) {
          hunks.push({ type: 'add', text: newLines[ni], newLine: ni + 1 });
          added++;
          ni++;
        }
      } else if (foundNewInOld > 0) {
        for (let k = 0; k < foundNewInOld; k++) {
          hunks.push({ type: 'remove', text: oldLines[oi], oldLine: oi + 1 });
          removed++;
          oi++;
        }
      } else {
        if (oi < oldLines.length) {
          hunks.push({ type: 'remove', text: ol, oldLine: oi + 1 });
          removed++;
          oi++;
        }
        if (ni < newLines.length) {
          hunks.push({ type: 'add', text: nl, newLine: ni + 1 });
          added++;
          ni++;
        }
      }
    }
  }

  return { added, removed, hunks: hunks.slice(0, 600) };
}

async function fetchExternalPageSafe(rawUrl: string): Promise<{
  finalUrl: string;
  status: number;
  title: string;
  description: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  forms: Array<{ action: string; method: string; fields: string[] }>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  textExtract: string;
  sanitizedHtml: string;
}> {
  const check = validateExternalHttpUrl(rawUrl);
  if (!check.ok) {
    throw new Error(check.error);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(check.url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'NovaWorkspaceAgent/1.0 (+https://localhost)',
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
      },
    });
    const finalCheck = validateExternalHttpUrl(resp.url || check.url.toString());
    if (!finalCheck.ok) {
      throw new Error('Redirect target blocked by SSRF guard.');
    }
    const contentType = resp.headers.get('content-type') || '';
    const rawBody = (await resp.text()).slice(0, 220_000);

    if (!contentType.includes('html')) {
      return {
        finalUrl: resp.url,
        status: resp.status,
        title: resp.url,
        description: contentType || 'Text/JSON response',
        headings: [],
        links: [],
        forms: [],
        tables: [],
        textExtract: rawBody.slice(0, 8000),
        sanitizedHtml: `<pre style="font-family:monospace;white-space:pre-wrap;padding:16px;background:#0f172a;color:#e2e8f0">${rawBody
          .slice(0, 8000)
          .replace(/</g, '&lt;')}</pre>`,
      };
    }

    const $ = cheerio.load(rawBody);
    $('script, noscript, iframe, object, embed').remove();
    $('[onload], [onerror], [onclick]').each((_, el) => {
      $(el).removeAttr('onload').removeAttr('onerror').removeAttr('onclick');
    });

    const title = $('title').first().text().trim() || resp.url;
    const description = $('meta[name="description"]').attr('content')?.trim() || '';
    const headings: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      if (txt && headings.length < 18) headings.push(txt);
    });

    const links: Array<{ text: string; href: string }> = [];
    $('a[href]').each((_, el) => {
      if (links.length >= 25) return;
      const href = $(el).attr('href') || '';
      const text = $(el).text().replace(/\s+/g, ' ').trim() || href;
      if (href.startsWith('http') || href.startsWith('/')) {
        try {
          const abs = new URL(href, resp.url).toString();
          links.push({ text: text.slice(0, 80), href: abs });
        } catch {
          // skip invalid href
        }
      }
    });

    const forms: Array<{ action: string; method: string; fields: string[] }> = [];
    $('form').each((_, formEl) => {
      if (forms.length >= 8) return;
      const action = $(formEl).attr('action') || resp.url;
      const method = ($(formEl).attr('method') || 'GET').toUpperCase();
      const fields: string[] = [];
      $(formEl)
        .find('input, select, textarea')
        .each((__, inp) => {
          const name = $(inp).attr('name') || $(inp).attr('id') || $(inp).attr('type') || 'field';
          if (fields.length < 12) fields.push(name);
        });
      forms.push({ action, method, fields });
    });

    const tables: Array<{ headers: string[]; rows: string[][] }> = [];
    $('table').each((_, tbl) => {
      if (tables.length >= 4) return;
      const headers: string[] = [];
      $(tbl)
        .find('thead th, tr:first-child th')
        .each((__, th) => {
          headers.push($(th).text().trim().slice(0, 60));
        });
      const rows: string[][] = [];
      $(tbl)
        .find('tbody tr, tr')
        .each((ri, tr) => {
          if (ri === 0 && headers.length > 0 && $(tr).find('th').length > 0) return;
          if (rows.length >= 12) return;
          const cells: string[] = [];
          $(tr)
            .find('td, th')
            .each((__, td) => {
              cells.push($(td).text().replace(/\s+/g, ' ').trim().slice(0, 90));
            });
          if (cells.length > 0) rows.push(cells);
        });
      if (rows.length > 0 || headers.length > 0) tables.push({ headers, rows });
    });

    const textExtract = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 12000);
    const sanitizedHtml = $.html().slice(0, 120_000);

    return {
      finalUrl: resp.url,
      status: resp.status,
      title,
      description,
      headings,
      links,
      forms,
      tables,
      textExtract,
      sanitizedHtml,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Router Factory ----------
export function createEcosystemRouter(deps: EcosystemRouteDeps): Router {
  const router = express.Router();
  const { getAiClient, tryGetAiClient, getGeminiErrorStatus, recordApiTelemetry } = deps;

  // Rate-limiting middleware on ecosystem routes (except lightweight status/health read if needed)
  router.use((req, res, next) => {
    const clientIp = String(req.ip || req.socket.remoteAddress || 'local');
    const rl = checkSlidingWindowRateLimit(clientIp);
    res.setHeader('X-RateLimit-Limit', String(rl.limit));
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
      appendAuditLog({
        module: 'control',
        action: 'rate_limit_blocked',
        actor: clientIp,
        outcome: 'blocked',
        details: `Rate limit exceeded on ${req.path}`,
      });
      res.status(429).json({
        error: `Rate limit reached (${rl.limit}/min). Retry in ${rl.resetSeconds}s.`,
      });
      return;
    }
    next();
  });

  // ============================================================================
  // MODULE 2: NOVA STUDIO – AI ARTIFACTS
  // ============================================================================
  router.post('/artifacts/generate', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    let modelUsed = 'gemini-4-hydrogen';
    try {
      const ai = getAiClient();
      const {
        prompt,
        kind = 'html',
        currentCode = '',
        editInstruction = '',
        projectInstructions = '',
      } = req.body ?? {};

      if (!prompt && !editInstruction) {
        res.status(400).json({ error: 'Provide an artifact prompt or natural-language edit instruction.' });
        return;
      }

      const modeGuide: Record<string, string> = {
        html: 'Create a self-contained single-file HTML5 + CSS3 + vanilla JavaScript interactive web application. No external CDN scripts needed.',
        react:
          'Create a complete interactive single-file React 18 component application wrapped cleanly in HTML using UMD React 18 + ReactDOM + Babel Standalone (`<script type="text/babel">`) mounted into `<div id="root"></div>`, using clean Tailwind/CSS styling.',
        dashboard:
          'Create an executive interactive HTML/CSS/SVG analytics dashboard with responsive layout, sortable/filterable data views, and crisp SVG charts.',
        diagram:
          'Create an interactive HTML+SVG diagram/architecture chart viewer with zoom/inspect controls and crisp labeling.',
      };

      const isIteration = Boolean(currentCode && editInstruction);
      const userPrompt = isIteration
        ? `Update the existing ${kind} artifact based strictly on this instruction: "${editInstruction}"\n\nExisting Code:\n\`\`\`html\n${String(
            currentCode
          ).slice(0, 40000)}\n\`\`\``
        : `${modeGuide[String(kind)] ?? modeGuide.html}\n\nRequest: ${String(prompt)}${
            projectInstructions ? `\n\nProject Context Instructions: ${String(projectInstructions)}` : ''
          }`;

      const schemaConfig = {
        systemInstruction:
          'You are Nova Studio Artifacts Architect. Build polished, genuinely interactive, error-free self-contained HTML/React/Dashboard web applications. Ensure zero runtime reference errors, dark/light accessible contrast, and responsive layout.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            code: { type: Type.STRING, description: 'Complete runnable HTML document starting with <!DOCTYPE html>' },
          },
          required: ['title', 'summary', 'code'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      };

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: userPrompt,
          config: schemaConfig,
        });
      } catch {
        modelUsed = 'gemini-3.1-flash-lite';
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: userPrompt,
          config: schemaConfig,
        });
      }

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        title?: string;
        summary?: string;
        code?: string;
      };

      recordApiTelemetry(
        '/api/nova/artifacts/generate',
        modelUsed,
        200,
        Date.now() - startedAt,
        true,
        `${isIteration ? 'Edited' : 'Created'} ${kind} artifact`
      );
      appendAuditLog({
        module: 'studio',
        action: isIteration ? 'edit_artifact' : 'create_artifact',
        actor: 'user',
        outcome: 'executed',
        details: `${parsed.title || 'Artifact'} (${kind})`,
      });

      res.json({
        title: parsed.title || 'Interactive Nova Artifact',
        summary: parsed.summary || 'Generated artifact ready for live preview.',
        code: parsed.code || '<!DOCTYPE html><html><body><p>Empty artifact</p></body></html>',
        modelUsed,
      });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      recordApiTelemetry('/api/nova/artifacts/generate', modelUsed, status, Date.now() - startedAt, false, message);
      res.status(status).json({ error: message });
    }
  });

  // ============================================================================
  // MODULE 3: NOVA CODE – WORKSPACE INSPECTION, DIFF, APPLY, ROLLBACK & TERMINAL
  // ============================================================================
  router.get('/code/tree', (_req: Request, res: Response) => {
    const files = walkWorkspaceFiles(WORKSPACE_ROOT);
    const enriched = files.map((f) => ({
      ...f,
      imports: extractFileImports(path.join(WORKSPACE_ROOT, f.path)),
    }));
    res.json({ rootName: path.basename(WORKSPACE_ROOT), files: enriched });
  });

  router.get('/code/read', (req: Request, res: Response) => {
    const rel = String(req.query.path ?? '');
    const resolved = resolveSafeWorkspacePath(rel);
    if (!resolved.ok) {
      res.status(403).json({ error: resolved.error });
      return;
    }
    if (!fs.existsSync(resolved.absPath) || fs.statSync(resolved.absPath).isDirectory()) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    const content = fs.readFileSync(resolved.absPath, 'utf8').slice(0, 120_000);
    const imports = extractFileImports(resolved.absPath);
    res.json({ path: resolved.relPath, content, imports });
  });

  router.post('/code/plan', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    let modelUsed = 'gemini-4-hydrogen';
    try {
      const ai = getAiClient();
      const {
        goal,
        selectedPaths = [],
        operation = 'modify',
      } = req.body ?? {};
      if (!goal || typeof goal !== 'string') {
        res.status(400).json({ error: 'Describe the coding task, refactor, or bug fix.' });
        return;
      }

      const tree = walkWorkspaceFiles(WORKSPACE_ROOT);
      const chosenPaths: string[] = Array.isArray(selectedPaths) && selectedPaths.length > 0
        ? selectedPaths.slice(0, 8).map(String)
        : tree
            .filter((f) => /\.(ts|tsx|js|jsx|json|css)$/.test(f.ext))
            .slice(0, 6)
            .map((f) => f.path);

      const fileContextParts: string[] = [];
      for (const p of chosenPaths) {
        const check = resolveSafeWorkspacePath(p);
        if (!check.ok || !fs.existsSync(check.absPath)) continue;
        const body = fs.readFileSync(check.absPath, 'utf8').slice(0, 12_000);
        fileContextParts.push(`### File: ${check.relPath}\n\`\`\`\n${body}\n\`\`\``);
      }

      const planPrompt = `Operation: ${operation}
Goal: ${goal}

Actual Project Directory Overview (${tree.length} files):
${tree.slice(0, 90).map((f) => `- ${f.path} (${f.size}B)`).join('\n')}

Inspected Source Files:
${fileContextParts.join('\n\n').slice(0, 48000)}

Instructions:
- Inspect the real codebase above carefully before proposing changes.
- Provide an architectural analysis and complete updated file contents for ONLY the files that need changes (keep edits accurate, type-safe, and minimal).
- Do NOT return partial snippets inside newContent; newContent MUST be the full replacement file text if you include a file edit.`;

      const cfg = {
        systemInstruction:
          'You are Nova Code, a principal software engineer working on the live repository. Never invent non-existent APIs or leave TODO placeholders in proposed file edits.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            edits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  newContent: { type: Type.STRING },
                },
                required: ['path', 'reason', 'newContent'],
              },
            },
          },
          required: ['analysis', 'edits'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      };

      let response;
      try {
        response = await ai.models.generateContent({ model: 'gemini-4-hydrogen', contents: planPrompt, config: cfg });
      } catch {
        modelUsed = 'gemini-3.1-flash-lite';
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: planPrompt,
          config: { ...cfg, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } },
        });
      }

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        analysis?: string;
        edits?: Array<{ path: string; reason: string; newContent: string }>;
      };

      const preparedEdits = [];
      for (const ed of parsed.edits ?? []) {
        const check = resolveSafeWorkspacePath(ed.path);
        if (!check.ok) continue;
        const existed = fs.existsSync(check.absPath);
        const previousContent = existed ? fs.readFileSync(check.absPath, 'utf8') : '';
        const diff = computeLineDiff(previousContent, ed.newContent);
        preparedEdits.push({
          path: check.relPath,
          reason: ed.reason,
          existed,
          previousContent,
          newContent: ed.newContent,
          diff,
        });
      }

      recordApiTelemetry('/api/nova/code/plan', modelUsed, 200, Date.now() - startedAt, true, `Planned ${preparedEdits.length} edits`);
      res.json({ analysis: parsed.analysis ?? '', edits: preparedEdits, modelUsed });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      recordApiTelemetry('/api/nova/code/plan', modelUsed, status, Date.now() - startedAt, false, message);
      res.status(status).json({ error: message });
    }
  });

  router.post('/code/apply', (req: Request, res: Response) => {
    const perm = getToolPermission('code.write');
    if (perm === 'deny') {
      appendAuditLog({
        module: 'code',
        action: 'apply_edits',
        actor: 'user',
        outcome: 'blocked',
        details: 'File write blocked by Nova Control policy (code.write = deny)',
      });
      res.status(403).json({ error: 'File modifications are disabled in Nova Control permissions.' });
      return;
    }

    const { edits = [], summary = 'Applied multi-file code update', confirmed = false } = req.body ?? {};
    if (!confirmed) {
      res.status(400).json({ error: 'Explicit user confirmation is required before writing workspace files.' });
      return;
    }
    if (!Array.isArray(edits) || edits.length === 0) {
      res.status(400).json({ error: 'No edits provided.' });
      return;
    }

    const snapshotFiles: Array<{ path: string; existed: boolean; previousContent: string; newContent: string }> = [];
    for (const item of edits) {
      const check = resolveSafeWorkspacePath(String(item.path || ''));
      if (!check.ok) {
        res.status(403).json({ error: check.error });
        return;
      }
      const existed = fs.existsSync(check.absPath);
      const previousContent = existed ? fs.readFileSync(check.absPath, 'utf8') : '';
      snapshotFiles.push({
        path: check.relPath,
        existed,
        previousContent,
        newContent: String(item.newContent ?? ''),
      });
    }

    const snapshot = saveCodeSnapshot({ summary: String(summary), files: snapshotFiles });
    for (const f of snapshotFiles) {
      const check = resolveSafeWorkspacePath(f.path);
      if (!check.ok) continue;
      fs.mkdirSync(path.dirname(check.absPath), { recursive: true });
      fs.writeFileSync(check.absPath, f.newContent, 'utf8');
    }

    appendAuditLog({
      module: 'code',
      action: 'apply_edits',
      actor: 'user',
      outcome: 'executed',
      details: `${snapshotFiles.length} file(s) updated · Snapshot ${snapshot.id}`,
    });

    res.json({
      ok: true,
      snapshotId: snapshot.id,
      appliedFiles: snapshotFiles.map((f) => f.path),
    });
  });

  router.get('/code/snapshots', (_req: Request, res: Response) => {
    res.json({ snapshots: listCodeSnapshots() });
  });

  router.post('/code/rollback', (req: Request, res: Response) => {
    const { snapshotId } = req.body ?? {};
    const snap = loadCodeSnapshot(String(snapshotId || ''));
    if (!snap) {
      res.status(404).json({ error: 'Rollback snapshot not found.' });
      return;
    }
    const restored: string[] = [];
    for (const f of snap.files) {
      const check = resolveSafeWorkspacePath(f.path);
      if (!check.ok) continue;
      if (f.existed) {
        fs.mkdirSync(path.dirname(check.absPath), { recursive: true });
        fs.writeFileSync(check.absPath, f.previousContent, 'utf8');
      } else if (fs.existsSync(check.absPath)) {
        fs.unlinkSync(check.absPath);
      }
      restored.push(f.path);
    }

    appendAuditLog({
      module: 'code',
      action: 'rollback_snapshot',
      actor: 'user',
      outcome: 'executed',
      details: `Restored ${snap.id} (${restored.join(', ')})`,
    });

    res.json({ ok: true, restored });
  });

  // Strictly allowlisted commands executed via execFile (NEVER shell: true!)
  const ALLOWED_COMMANDS: Record<string, { cmd: string; args: string[]; label: string }> = {
    typecheck: { cmd: 'npm', args: ['run', 'lint'], label: 'TypeScript Typecheck (npm run lint)' },
    build: { cmd: 'npm', args: ['run', 'build'], label: 'Vite Production Build (npm run build)' },
    rules_lint: { cmd: 'npx', args: ['eslint', 'firestore.rules'], label: 'Firestore Rules Lint' },
    git_status: { cmd: 'git', args: ['status', '--short'], label: 'Git Status' },
    git_diff: { cmd: 'git', args: ['diff', '--stat'], label: 'Git Diff Summary' },
    git_log: { cmd: 'git', args: ['log', '-n', '10', '--oneline'], label: 'Recent Git Commits' },
  };

  router.post('/code/run', async (req: Request, res: Response) => {
    const perm = getToolPermission('code.terminal');
    if (perm === 'deny') {
      res.status(403).json({ error: 'Terminal execution is blocked by Nova Control policy.' });
      return;
    }
    const { commandKey, analyzeFailure = false } = req.body ?? {};
    const spec = ALLOWED_COMMANDS[String(commandKey ?? '')];
    if (!spec) {
      res.status(400).json({ error: 'Unsupported or unapproved command key.' });
      return;
    }

    const startedAt = Date.now();
    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
      const result = await execFileAsync(spec.cmd, spec.args, {
        cwd: WORKSPACE_ROOT,
        timeout: 45_000,
        maxBuffer: 1024 * 1024,
        shell: false,
      });
      stdout = result.stdout ?? '';
      stderr = result.stderr ?? '';
    } catch (err: unknown) {
      const e = err as { code?: number | string; stdout?: string; stderr?: string; message?: string };
      exitCode = typeof e.code === 'number' ? e.code : 1;
      stdout = e.stdout ?? '';
      stderr = e.stderr ?? (e.message ?? 'Command failed');
    }

    let failureAnalysis = '';
    if (exitCode !== 0 && analyzeFailure) {
      const ai = tryGetAiClient();
      if (ai) {
        try {
          const resp = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Analyze this build/lint failure concisely (root cause + exact fix):\nCommand: ${spec.label}\nOutput:\n${(stderr + '\n' + stdout).slice(0, 6000)}`,
          });
          failureAnalysis = (resp.text ?? '').trim();
        } catch {
          // ignore secondary analysis error
        }
      }
    }

    appendAuditLog({
      module: 'code',
      action: `terminal:${commandKey}`,
      actor: 'user',
      outcome: exitCode === 0 ? 'executed' : 'error',
      details: `${spec.label} exited with ${exitCode} (${Date.now() - startedAt}ms)`,
    });

    res.json({
      ok: exitCode === 0,
      exitCode,
      label: spec.label,
      stdout: stdout.slice(0, 20000),
      stderr: stderr.slice(0, 20000),
      durationMs: Date.now() - startedAt,
      failureAnalysis,
    });
  });

  router.post('/code/docs', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const { docType = 'architecture', selectedPaths = [] } = req.body ?? {};
      const tree = walkWorkspaceFiles(WORKSPACE_ROOT);
      const targets =
        Array.isArray(selectedPaths) && selectedPaths.length > 0
          ? selectedPaths.slice(0, 6).map(String)
          : ['package.json', 'src/App.tsx', 'server.ts'].filter((p) =>
              fs.existsSync(path.join(WORKSPACE_ROOT, p))
            );
      const snippets = targets
        .map((p) => {
          const chk = resolveSafeWorkspacePath(p);
          if (!chk.ok || !fs.existsSync(chk.absPath)) return '';
          return `### ${chk.relPath}\n\`\`\`\n${fs.readFileSync(chk.absPath, 'utf8').slice(0, 6000)}\n\`\`\``;
        })
        .filter(Boolean)
        .join('\n\n');

      const out = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Generate clean, accurate ${docType} documentation in Markdown based strictly on these workspace files:\n\nFile Inventory:\n${tree
          .slice(0, 60)
          .map((f) => `- ${f.path}`)
          .join('\n')}\n\n${snippets}`,
      });
      res.json({ markdown: (out.text ?? '').trim() });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      res.status(status).json({ error: message });
    }
  });

  router.post('/code/github', async (req: Request, res: Response) => {
    const perm = getToolPermission('code.github');
    if (perm === 'deny') {
      res.status(403).json({ error: 'GitHub integration is blocked by Nova Control policy.' });
      return;
    }
    const { connectorId = 'conn-github-default', action = 'list_repos', repo = '', confirmed = false } = req.body ?? {};
    const token = getConnectorSecret(String(connectorId));
    if (!token) {
      res.status(400).json({ error: 'No GitHub Personal Access Token configured in NOVA Connect.' });
      return;
    }

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NovaWorkspaceAgent',
      };
      if (action === 'list_repos') {
        const r = await fetch('https://api.github.com/user/repos?per_page=15&sort=updated', { headers });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.message || `GitHub HTTP ${r.status}`);
        res.json({
          repos: Array.isArray(json)
            ? json.map((rp: { full_name: string; private: boolean; default_branch: string; html_url: string; updated_at: string }) => ({
                fullName: rp.full_name,
                private: rp.private,
                defaultBranch: rp.default_branch,
                url: rp.html_url,
                updatedAt: rp.updated_at,
              }))
            : [],
        });
        return;
      }
      if (action === 'list_issues' && repo) {
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo))) {
          res.status(400).json({ error: 'Invalid owner/repo format.' });
          return;
        }
        const r = await fetch(`https://api.github.com/repos/${repo}/issues?per_page=15&state=open`, { headers });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.message || `GitHub HTTP ${r.status}`);
        res.json({
          issues: Array.isArray(json)
            ? json.map((iss: { number: number; title: string; state: string; html_url: string }) => ({
                number: iss.number,
                title: iss.title,
                state: iss.state,
                url: iss.html_url,
              }))
            : [],
        });
        return;
      }
      if (action === 'create_issue' && repo) {
        if (!confirmed) {
          res.status(400).json({ error: 'User confirmation required for GitHub write actions.' });
          return;
        }
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo))) {
          res.status(400).json({ error: 'Invalid owner/repo format.' });
          return;
        }
        const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: String(req.body.title || 'NOVA Issue'),
            body: String(req.body.body || ''),
          }),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.message || `GitHub HTTP ${r.status}`);
        appendAuditLog({
          module: 'code',
          action: 'github_create_issue',
          actor: 'user',
          outcome: 'executed',
          details: `Created issue #${json.number} on ${repo}`,
        });
        res.json({ issue: { number: json.number, title: json.title, url: json.html_url } });
        return;
      }
      res.status(400).json({ error: 'Unsupported GitHub action.' });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'GitHub request failed.' });
    }
  });

  // ============================================================================
  // MODULE 4: NOVA SKILLS – AUTO-DETECTION
  // ============================================================================
  router.post('/skills/detect', (req: Request, res: Response) => {
    const { prompt = '', skills = [] } = req.body ?? {};
    const text = String(prompt).toLowerCase();
    const matched = (Array.isArray(skills) ? skills : [])
      .filter((s: { autoDetect?: boolean; triggers?: string[]; name?: string; description?: string }) => {
        if (s.autoDetect === false) return false;
        const triggers = Array.isArray(s.triggers) ? s.triggers : [];
        return triggers.some((kw) => kw && text.includes(String(kw).toLowerCase()));
      })
      .map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
    res.json({ matched });
  });

  // ============================================================================
  // MODULE 5: NOVA AGENTS – MULTI-AGENT PARALLEL COORDINATOR
  // ============================================================================
  router.post('/multi-agent/run', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const ai = getAiClient();
      const {
        goal,
        projectContext = '',
        selectedAgents = [],
      } = req.body ?? {};

      if (!goal || typeof goal !== 'string' || !goal.trim()) {
        res.status(400).json({ error: 'Provide a task or objective for NOVA Agents.' });
        return;
      }

      const VALID_AGENTS = [
        'planning',
        'research',
        'coding',
        'testing',
        'data_analysis',
        'documentation',
        'qa',
      ] as const;

      // Step 1: Central coordinator classifies complexity & decomposes independent parallel tasks
      const coordConfig = {
        systemInstruction:
          'You are Nova Central Multi-Agent Coordinator. Evaluate task complexity honestly. If the request is simple and single-faceted (e.g. a basic greeting or one-line factual lookup), classify complexity as "simple" and avoid spawning redundant agents. If complex, assign 2-6 relevant specialized agents.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            complexity: { type: Type.STRING, description: 'simple or complex' },
            coordinatorSummary: { type: Type.STRING },
            assignments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  agent: {
                    type: Type.STRING,
                    description: 'planning, research, coding, testing, data_analysis, documentation, or qa',
                  },
                  subtask: { type: Type.STRING },
                },
                required: ['agent', 'subtask'],
              },
            },
          },
          required: ['complexity', 'coordinatorSummary', 'assignments'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      };

      const coordResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Goal: "${goal.trim()}"\n${
          Array.isArray(selectedAgents) && selectedAgents.length > 0
            ? `User-requested preferred agents: ${selectedAgents.join(', ')}\n`
            : ''
        }${projectContext ? `Project Context: ${String(projectContext).slice(0, 1500)}` : ''}`,
        config: coordConfig,
      });

      const plan = JSON.parse((coordResp.text ?? '{}').trim()) as {
        complexity?: string;
        coordinatorSummary?: string;
        assignments?: Array<{ agent: string; subtask: string }>;
      };

      const isSimple =
        plan.complexity === 'simple' &&
        (!Array.isArray(selectedAgents) || selectedAgents.length === 0);

      if (isSimple) {
        const direct = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: goal.trim(),
        });
        recordApiTelemetry('/api/nova/multi-agent/run', 'gemini-3.1-flash-lite', 200, Date.now() - startedAt, true, 'Fast-path simple request');
        res.json({
          complexity: 'simple',
          skippedMultiAgent: true,
          coordinatorSummary:
            plan.coordinatorSummary || 'Task handled via direct fast-path without spawning unnecessary agents.',
          agentRuns: [],
          conflicts: [],
          finalOutput: (direct.text ?? '').trim(),
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      const AGENT_PERSONAS: Record<string, string> = {
        planning: 'Planning Agent: Produce milestones, architecture dependencies, risk checks, and ordered execution sequence.',
        research: 'Research Agent: Verify facts, compare options with citations/grounding, note assumptions vs confirmed facts.',
        coding: 'Coding Agent: Write production-grade TypeScript/code modules, interfaces, and security-checked logic.',
        testing: 'Testing Agent: Design edge cases, unit/integration test payloads, boundary assertions, and failure modes.',
        data_analysis: 'Data Analysis Agent: Analyze metrics, schema shapes, quantitative trade-offs, and tabular summaries.',
        documentation: 'Documentation Agent: Produce crisp usage guides, API contracts, and developer documentation.',
        qa: 'Quality Assurance Agent: Audit outputs for bugs, inconsistencies, missing edge cases, and requirement compliance.',
      };

      const rawAssignments = (plan.assignments ?? [])
        .filter((a) => (VALID_AGENTS as readonly string[]).includes(a.agent))
        .slice(0, 6);

      const finalAssignments =
        rawAssignments.length > 0
          ? rawAssignments
          : [{ agent: 'planning', subtask: goal.trim() }, { agent: 'qa', subtask: `Verify plan for: ${goal.trim()}` }];

      // Step 2: Run specialist worker agents IN PARALLEL (excluding QA if present, so QA can audit workers)
      const workerAssignments = finalAssignments.filter((a) => a.agent !== 'qa');
      const qaAssignment = finalAssignments.find((a) => a.agent === 'qa');

      const workerRuns = await Promise.all(
        workerAssignments.map(async (item) => {
          const t0 = Date.now();
          try {
            const useSearch = item.agent === 'research';
            const resp = await ai.models.generateContent({
              model: useSearch ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite',
              contents: `Overall Objective: ${goal.trim()}\nYour Specialized Role: ${item.agent}\nAssigned Subtask: ${item.subtask}\n${
                projectContext ? `Shared Context: ${String(projectContext).slice(0, 1200)}` : ''
              }`,
              config: {
                systemInstruction: AGENT_PERSONAS[item.agent] ?? 'Specialized Nova Agent',
                ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
              },
            });
            return {
              agent: item.agent,
              subtask: item.subtask,
              status: 'completed' as const,
              durationMs: Date.now() - t0,
              output: (resp.text ?? '').trim(),
            };
          } catch (e) {
            return {
              agent: item.agent,
              subtask: item.subtask,
              status: 'failed' as const,
              durationMs: Date.now() - t0,
              output: e instanceof Error ? e.message : 'Agent execution error',
            };
          }
        })
      );

      // Step 3: QA Verification + Conflict Comparison & Synthesis across collected results
      const combinedEvidence = workerRuns
        .map((r) => `## ${r.agent.toUpperCase()} (${r.status})\nSubtask: ${r.subtask}\nOutput:\n${r.output.slice(0, 3200)}`)
        .join('\n\n');

      const synthConfig = {
        systemInstruction:
          'You are Nova Central Verifier & Conflict Auditor. Compare all agent outputs rigorously: identify contradictions or conflicting recommendations between agents, verify alignment with the goal, and synthesize one authoritative verified deliverable.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            conflicts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  agentsInvolved: { type: Type.ARRAY, items: { type: Type.STRING } },
                  detail: { type: Type.STRING },
                  resolution: { type: Type.STRING },
                },
                required: ['topic', 'agentsInvolved', 'detail', 'resolution'],
              },
            },
            qaVerdict: { type: Type.STRING },
            finalOutput: { type: Type.STRING },
          },
          required: ['conflicts', 'qaVerdict', 'finalOutput'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      };

      const qaResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Objective: ${goal.trim()}\n${qaAssignment ? `QA Focus: ${qaAssignment.subtask}\n` : ''}\nCollected Worker Results:\n${combinedEvidence}`,
        config: synthConfig,
      });
      const verified = JSON.parse((qaResp.text ?? '{}').trim()) as {
        conflicts?: Array<{ topic: string; agentsInvolved: string[]; detail: string; resolution: string }>;
        qaVerdict?: string;
        finalOutput?: string;
      };

      const allRuns = [
        ...workerRuns,
        {
          agent: 'qa',
          subtask: qaAssignment?.subtask || 'Cross-agent verification & conflict detection',
          status: 'completed' as const,
          durationMs: Date.now() - startedAt,
          output: verified.qaVerdict || 'Verification completed.',
        },
      ];

      recordApiTelemetry('/api/nova/multi-agent/run', 'gemini-4-hydrogen', 200, Date.now() - startedAt, true, `${allRuns.length} agents completed`);
      res.json({
        complexity: 'complex',
        skippedMultiAgent: false,
        coordinatorSummary: plan.coordinatorSummary ?? 'Executed parallel multi-agent pipeline.',
        agentRuns: allRuns,
        conflicts: verified.conflicts ?? [],
        finalOutput: verified.finalOutput || workerRuns.map((w) => w.output).join('\n\n'),
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      recordApiTelemetry('/api/nova/multi-agent/run', 'gemini-4-hydrogen', status, Date.now() - startedAt, false, message);
      res.status(status).json({ error: message });
    }
  });

  // ============================================================================
  // MODULE 6: NOVA COMPUTER – PERMISSIONED WEB / DOM / FILE AUTOMATION
  // ============================================================================
  router.post('/computer/plan', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const { task, targetUrl = '' } = req.body ?? {};
      if (!task || typeof task !== 'string') {
        res.status(400).json({ error: 'Describe the browser/web/file automation task.' });
        return;
      }

      const planConfig = {
        systemInstruction:
          'You are Nova Computer Use Planner. Convert user tasks into safe, auditable browser/HTTP/workspace steps. Allowed step kinds: "fetch_page" (fetch & inspect a public http/https URL), "extract_data" (extract structured selectors/tables/links from a loaded page), "inspect_workspace" (inspect a workspace file safely), "submit_form" (HTTP form/POST submission requiring explicit confirmation). Every step must accurately reflect its action and mark requiresConfirmation=true.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  label: { type: Type.STRING },
                  preview: { type: Type.STRING },
                  target: { type: Type.STRING },
                  selectorOrQuery: { type: Type.STRING },
                },
                required: ['id', 'kind', 'label', 'preview', 'target'],
              },
            },
          },
          required: ['summary', 'steps'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      };

      const resp = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Task: ${task}\n${targetUrl ? `Target URL: ${targetUrl}` : ''}`,
        config: planConfig,
      });
      const parsed = JSON.parse((resp.text ?? '{}').trim());
      res.json({
        environmentNote:
          'Executes inside NOVA sandboxed HTTP/DOM & workspace session (cannot control external desktop OS GUI apps outside the container).',
        summary: parsed.summary || 'Planned workflow',
        steps: Array.isArray(parsed.steps)
          ? parsed.steps.map((s: Record<string, unknown>, idx: number) => ({
              id: String(s.id || `comp-${idx + 1}`),
              kind: String(s.kind || 'fetch_page'),
              label: String(s.label || `Step ${idx + 1}`),
              preview: String(s.preview || ''),
              target: String(s.target || targetUrl || ''),
              selectorOrQuery: String(s.selectorOrQuery || ''),
              requiresConfirmation: true,
              status: 'pending',
            }))
          : [],
      });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      res.status(status).json({ error: message });
    }
  });

  router.post('/computer/execute-step', async (req: Request, res: Response) => {
    const {
      kind = 'fetch_page',
      target = '',
      selectorOrQuery = '',
      confirmed = false,
      screenshotBase64 = '',
      screenshotMimeType = 'image/png',
    } = req.body ?? {};

    if (!confirmed) {
      res.status(400).json({ error: 'Explicit approval is required before executing a Computer Use action.' });
      return;
    }

    try {
      if (kind === 'analyze_screen' && screenshotBase64) {
        const ai = getAiClient();
        const resp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: String(screenshotMimeType),
                  data: String(screenshotBase64).replace(/^data:[^;]+;base64,/, ''),
                },
              },
              { text: String(selectorOrQuery || 'Identify all interactive controls, forms, text, and next suggested actions visible on this screen.') },
            ],
          },
        });
        appendAuditLog({
          module: 'computer',
          action: 'analyze_screen',
          actor: 'user',
          outcome: 'executed',
          details: 'Analyzed uploaded screen capture',
        });
        res.json({
          ok: true,
          kind: 'analyze_screen',
          analysisText: (resp.text ?? '').trim(),
        });
        return;
      }

      if (kind === 'inspect_workspace') {
        const chk = resolveSafeWorkspacePath(String(target));
        if (!chk.ok) {
          res.status(403).json({ error: chk.error });
          return;
        }
        if (!fs.existsSync(chk.absPath)) {
          res.status(404).json({ error: 'Workspace file not found.' });
          return;
        }
        const content = fs.readFileSync(chk.absPath, 'utf8').slice(0, 12_000);
        appendAuditLog({
          module: 'computer',
          action: 'inspect_workspace',
          actor: 'user',
          outcome: 'executed',
          details: `Inspected ${chk.relPath}`,
        });
        res.json({
          ok: true,
          kind,
          filePath: chk.relPath,
          textExtract: content,
        });
        return;
      }

      const perm = getToolPermission('computer.fetch');
      if (perm === 'deny') {
        res.status(403).json({ error: 'External web automation is blocked in Nova Control.' });
        return;
      }

      const page = await fetchExternalPageSafe(String(target));
      let extractedMatches: string[] = [];
      if (selectorOrQuery && page.sanitizedHtml) {
        try {
          const $ = cheerio.load(page.sanitizedHtml);
          $(String(selectorOrQuery)).each((_, el) => {
            const t = $(el).text().replace(/\s+/g, ' ').trim();
            if (t && extractedMatches.length < 30) extractedMatches.push(t.slice(0, 200));
          });
        } catch {
          extractedMatches = [];
        }
      }

      appendAuditLog({
        module: 'computer',
        action: kind,
        actor: 'user',
        outcome: 'executed',
        details: `${page.status} ${page.finalUrl} (${page.headings.length} headings, ${page.forms.length} forms)`,
      });

      res.json({
        ok: true,
        kind,
        page,
        extractedMatches,
      });
    } catch (err) {
      appendAuditLog({
        module: 'computer',
        action: kind,
        actor: 'user',
        outcome: 'error',
        details: err instanceof Error ? err.message : 'Step execution error',
      });
      res.status(502).json({ error: err instanceof Error ? err.message : 'Unable to execute step.' });
    }
  });

  // ============================================================================
  // MODULE 7: NOVA RESEARCH – MULTI-SOURCE ENGINE WITH CITATIONS & CONFLICTS
  // ============================================================================
  router.post('/research/run', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const ai = getAiClient();
      const { topic, urls = [], depth = 'standard' } = req.body ?? {};
      if (!topic || typeof topic !== 'string' || !topic.trim()) {
        res.status(400).json({ error: 'Provide a research question or topic.' });
        return;
      }

      const validUrls = (Array.isArray(urls) ? urls : [])
        .map(String)
        .filter((u) => validateExternalHttpUrl(u).ok)
        .slice(0, 4);

      // Step 1: Decompose research topic into 3 complementary investigation angles + read URLs
      const [subQueryResp, urlPages] = await Promise.all([
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Generate 2 focused sub-queries to investigate thoroughly: "${topic.trim()}"`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: { queries: { type: Type.ARRAY, items: { type: Type.STRING } } },
              required: ['queries'],
            },
          },
        }),
        Promise.all(
          validUrls.map(async (u) => {
            try {
              return await fetchExternalPageSafe(u);
            } catch {
              return null;
            }
          })
        ),
      ]);

      const parsedQueries = JSON.parse((subQueryResp.text ?? '{}').trim()) as { queries?: string[] };
      const investigationQueries = [topic.trim(), ...(parsedQueries.queries ?? []).slice(0, 2)];

      // Step 2: Execute grounded Google Search investigations in parallel
      const searchFindings = await Promise.all(
        investigationQueries.map(async (q) => {
          const resp = await ai.models.generateContent({
            model: depth === 'deep' ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite',
            contents: `Investigate and verify concrete facts, dates, metrics, and differing perspectives on: "${q}"`,
            config: {
              tools: [{ googleSearch: {} }],
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          const chunks = resp.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          const sources = chunks
            .filter((c) => Boolean(c.web?.uri))
            .map((c) => ({ title: c.web?.title || c.web?.uri || 'Source', uri: c.web?.uri || '' }));
          return { query: q, notes: (resp.text ?? '').trim(), sources };
        })
      );

      const allCitationsMap = new Map<string, { id: string; title: string; uri: string }>();
      for (const sf of searchFindings) {
        for (const s of sf.sources) {
          if (s.uri && !allCitationsMap.has(s.uri)) {
            allCitationsMap.set(s.uri, { id: `src-${allCitationsMap.size + 1}`, title: s.title, uri: s.uri });
          }
        }
      }
      for (const p of urlPages) {
        if (p?.finalUrl && !allCitationsMap.has(p.finalUrl)) {
          allCitationsMap.set(p.finalUrl, { id: `src-${allCitationsMap.size + 1}`, title: p.title, uri: p.finalUrl });
        }
      }
      const citations = Array.from(allCitationsMap.values());

      // Step 3: Cross-source comparison, facts vs assumptions separation, and conflict detection
      const evidenceCorpus = [
        ...searchFindings.map((f) => `### Search Angle: ${f.query}\n${f.notes.slice(0, 3500)}`),
        ...urlPages
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) => `### Direct Page: ${p.title} (${p.finalUrl})\n${p.textExtract.slice(0, 3500)}`),
      ].join('\n\n');

      const synthConfig = {
        systemInstruction:
          'You are Nova Deep Research Analyst. Produce an objective, citation-grounded synthesis. Explicitly separate Verified Facts from Assumptions/Uncertainties, identify conflicting claims across sources, and provide a source comparison matrix.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            executiveSummary: { type: Type.STRING },
            verifiedFacts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  claim: { type: Type.STRING },
                  sourceLabel: { type: Type.STRING },
                  confidence: { type: Type.STRING },
                },
                required: ['claim', 'sourceLabel', 'confidence'],
              },
            },
            assumptionsAndUncertainties: { type: Type.ARRAY, items: { type: Type.STRING } },
            conflictingClaims: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  perspectiveA: { type: Type.STRING },
                  perspectiveB: { type: Type.STRING },
                },
                required: ['topic', 'perspectiveA', 'perspectiveB'],
              },
            },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  heading: { type: Type.STRING },
                  content: { type: Type.STRING },
                },
                required: ['heading', 'content'],
              },
            },
          },
          required: ['title', 'executiveSummary', 'verifiedFacts', 'assumptionsAndUncertainties', 'conflictingClaims', 'sections'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      };

      const synthResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Primary Research Question: ${topic.trim()}\n\nCollected Multi-Source Evidence:\n${evidenceCorpus.slice(
          0,
          36000
        )}\n\nIndexed Citations:\n${citations.map((c) => `[${c.id}] ${c.title} (${c.uri})`).join('\n')}`,
        config: synthConfig,
      });

      const report = JSON.parse((synthResp.text ?? '{}').trim());
      recordApiTelemetry('/api/nova/research/run', 'gemini-4-hydrogen', 200, Date.now() - startedAt, true, `${citations.length} sources`);
      appendAuditLog({
        module: 'research',
        action: 'deep_research',
        actor: 'user',
        outcome: 'executed',
        details: `"${topic.trim().slice(0, 60)}" · ${citations.length} citations`,
      });

      res.json({
        ...report,
        query: topic.trim(),
        queriesInvestigated: investigationQueries,
        citations,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      recordApiTelemetry('/api/nova/research/run', 'gemini-4-hydrogen', status, Date.now() - startedAt, false, message);
      res.status(status).json({ error: message });
    }
  });

  // ============================================================================
  // MODULE 8: NOVA CONNECT – MCP, GITHUB & EXTERNAL API CONNECTORS (SERVER VAULT)
  // ============================================================================
  router.get('/connect', (_req: Request, res: Response) => {
    res.json({ connectors: listConnectorsPublic() });
  });

  router.post('/connect', (req: Request, res: Response) => {
    const { id, name, kind, endpointUrl, description, secretToken, headerName, permissionMode } = req.body ?? {};
    if (!name || !kind || !endpointUrl) {
      res.status(400).json({ error: 'Name, connector type, and endpoint URL are required.' });
      return;
    }
    const urlCheck = validateExternalHttpUrl(String(endpointUrl));
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }
    const saved = upsertConnector({
      id,
      name: String(name),
      kind,
      endpointUrl: urlCheck.url.toString(),
      description: String(description || ''),
      secretToken: typeof secretToken === 'string' ? secretToken : undefined,
      headerName: headerName ? String(headerName) : undefined,
      permissionMode,
    });
    appendAuditLog({
      module: 'connect',
      action: 'save_connector',
      actor: 'user',
      outcome: 'executed',
      details: `${saved.kind}:${saved.name} (${saved.hasSecret ? 'encrypted token stored' : 'no token'})`,
    });
    res.json({ connector: saved });
  });

  router.delete('/connect/:id', (req: Request, res: Response) => {
    const ok = deleteConnector(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Connector not found.' });
      return;
    }
    appendAuditLog({
      module: 'connect',
      action: 'delete_connector',
      actor: 'user',
      outcome: 'executed',
      details: `Removed connector ${req.params.id}`,
    });
    res.json({ ok: true });
  });

  router.post('/connect/:id/test', async (req: Request, res: Response) => {
    const raw = listConnectorsRaw().find((c) => c.id === req.params.id);
    if (!raw) {
      res.status(404).json({ error: 'Connector not found.' });
      return;
    }
    const urlCheck = validateExternalHttpUrl(raw.endpointUrl);
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }

    const secret = getConnectorSecret(raw.id);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (secret) {
      const hName = raw.headerName || 'Authorization';
      headers[hName] = hName.toLowerCase() === 'authorization' && !secret.startsWith('Bearer ')
        ? `Bearer ${secret}`
        : secret;
    }

    const checkedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
      if (raw.kind === 'mcp') {
        // Real Model Context Protocol JSON-RPC tools/list handshake
        const rpcResp = await fetch(urlCheck.url.toString(), {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `nova-mcp-${Date.now()}`,
            method: 'tools/list',
            params: {},
          }),
        });
        const data = (await rpcResp.json()) as {
          result?: { tools?: Array<{ name: string; description?: string }> };
          error?: { message?: string };
        };
        if (!rpcResp.ok || data.error) {
          throw new Error(data.error?.message || `MCP HTTP ${rpcResp.status}`);
        }
        const tools = (data.result?.tools ?? []).slice(0, 30);
        const updated = updateConnectorMeta(raw.id, {
          status: 'connected',
          lastCheckedAt: checkedAt,
          lastError: undefined,
          discoveredTools: tools,
        });
        res.json({ ok: true, connector: updated, details: `MCP connected (${tools.length} tools)` });
        return;
      }

      const testUrl = raw.kind === 'github' ? 'https://api.github.com/user' : urlCheck.url.toString();
      const resp = await fetch(testUrl, {
        method: 'GET',
        headers: { ...headers, 'User-Agent': 'NovaWorkspaceAgent' },
      });
      if (!resp.ok) {
        throw new Error(`Endpoint returned HTTP ${resp.status}`);
      }
      const updated = updateConnectorMeta(raw.id, {
        status: 'connected',
        lastCheckedAt: checkedAt,
        lastError: undefined,
      });
      res.json({ ok: true, connector: updated, details: `HTTP ${resp.status} OK` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      const updated = updateConnectorMeta(raw.id, {
        status: 'error',
        lastCheckedAt: checkedAt,
        lastError: msg,
      });
      res.status(502).json({ ok: false, error: msg, connector: updated });
    }
  });

  router.post('/connect/:id/invoke', async (req: Request, res: Response) => {
    const raw = listConnectorsRaw().find((c) => c.id === req.params.id);
    if (!raw) {
      res.status(404).json({ error: 'Connector not found.' });
      return;
    }
    if (raw.permissionMode === 'deny') {
      res.status(403).json({ error: 'Connector execution is denied by permission settings.' });
      return;
    }
    if (raw.permissionMode === 'ask' && !req.body?.confirmed) {
      res.status(400).json({ error: 'Explicit user confirmation is required before invoking this connector.' });
      return;
    }

    const secret = getConnectorSecret(raw.id);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (secret) {
      const hName = raw.headerName || 'Authorization';
      headers[hName] = hName.toLowerCase() === 'authorization' && !secret.startsWith('Bearer ')
        ? `Bearer ${secret}`
        : secret;
    }

    try {
      if (raw.kind === 'mcp') {
        const { toolName, toolArgs = {} } = req.body ?? {};
        if (!toolName) {
          res.status(400).json({ error: 'Specify MCP toolName.' });
          return;
        }
        const rpcResp = await fetch(raw.endpointUrl, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `nova-call-${Date.now()}`,
            method: 'tools/call',
            params: { name: String(toolName), arguments: toolArgs },
          }),
        });
        const json = await rpcResp.json();
        appendAuditLog({
          module: 'connect',
          action: `mcp:${toolName}`,
          actor: 'user',
          outcome: rpcResp.ok ? 'executed' : 'error',
          details: `${raw.name} tool=${toolName}`,
        });
        res.json({ ok: rpcResp.ok, result: json });
        return;
      }

      const { method = 'GET', subPath = '', bodyPayload } = req.body ?? {};
      const safeMethod = ['GET', 'POST'].includes(String(method).toUpperCase())
        ? String(method).toUpperCase()
        : 'GET';
      const targetUrl = subPath ? new URL(String(subPath), raw.endpointUrl).toString() : raw.endpointUrl;
      const check = validateExternalHttpUrl(targetUrl);
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }

      const resp = await fetch(check.url.toString(), {
        method: safeMethod,
        headers: {
          ...headers,
          'User-Agent': 'NovaWorkspaceAgent',
          ...(safeMethod === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(safeMethod === 'POST' && bodyPayload !== undefined
          ? { body: JSON.stringify(bodyPayload) }
          : {}),
      });
      const text = (await resp.text()).slice(0, 20_000);
      appendAuditLog({
        module: 'connect',
        action: `${raw.kind}:${safeMethod}`,
        actor: 'user',
        outcome: resp.ok ? 'executed' : 'error',
        details: `${check.url.toString()} -> HTTP ${resp.status}`,
      });
      res.json({ ok: resp.ok, status: resp.status, responseText: text });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Connector invoke failed' });
    }
  });

  // ============================================================================
  // MODULE 9: NOVA SCHEDULER – PERSISTENT BACKEND JOB DAEMON
  // ============================================================================
  router.get('/scheduler/jobs', (_req: Request, res: Response) => {
    res.json({ jobs: listScheduledJobs() });
  });

  router.post('/scheduler/jobs', (req: Request, res: Response) => {
    const {
      title,
      kind = 'daily_summary',
      prompt = '',
      cadence = 'daily',
      cronExpr = '',
      delayMinutes = 5,
    } = req.body ?? {};

    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Job title is required.' });
      return;
    }

    const validCadence: ScheduleCadence = ['once', 'hourly', 'daily', 'weekly', 'cron'].includes(cadence)
      ? cadence
      : 'daily';
    const validKind: ScheduleJobKind = ['daily_summary', 'weekly_report', 'scheduled_research', 'task_reminder'].includes(kind)
      ? kind
      : 'daily_summary';

    const nowMs = Date.now();
    const nextRunAtMs =
      validCadence === 'once'
        ? nowMs + Math.max(1, Number(delayMinutes) || 5) * 60 * 1000
        : computeNextRunMs(validCadence, nowMs, String(cronExpr || ''));

    const job: ScheduledJob = {
      id: `job-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim().slice(0, 120),
      kind: validKind,
      prompt: String(prompt).trim().slice(0, 1200),
      cadence: validCadence,
      cronExpr: cronExpr ? String(cronExpr).trim() : undefined,
      enabled: true,
      nextRunAtMs,
      runCount: 0,
      history: [],
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const jobs = listScheduledJobs();
    jobs.unshift(job);
    saveScheduledJobs(jobs);

    appendAuditLog({
      module: 'scheduler',
      action: 'create_job',
      actor: 'user',
      outcome: 'executed',
      details: `${job.title} (${job.cadence})`,
    });

    res.json({ job });
  });

  router.patch('/scheduler/jobs/:id', (req: Request, res: Response) => {
    const jobs = listScheduledJobs();
    const idx = jobs.findIndex((j) => j.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Scheduled job not found.' });
      return;
    }
    const patch = req.body ?? {};
    const current = jobs[idx];
    const nextCadence: ScheduleCadence = patch.cadence ?? current.cadence;
    const updated: ScheduledJob = {
      ...current,
      title: typeof patch.title === 'string' ? patch.title.trim().slice(0, 120) : current.title,
      prompt: typeof patch.prompt === 'string' ? patch.prompt.trim().slice(0, 1200) : current.prompt,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
      cadence: nextCadence,
      cronExpr: typeof patch.cronExpr === 'string' ? patch.cronExpr : current.cronExpr,
      nextRunAtMs:
        patch.cadence || patch.cronExpr
          ? computeNextRunMs(nextCadence, Date.now(), patch.cronExpr ?? current.cronExpr)
          : current.nextRunAtMs,
    };
    jobs[idx] = updated;
    saveScheduledJobs(jobs);
    res.json({ job: updated });
  });

  router.delete('/scheduler/jobs/:id', (req: Request, res: Response) => {
    const jobs = listScheduledJobs();
    const next = jobs.filter((j) => j.id !== req.params.id);
    if (next.length === jobs.length) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    saveScheduledJobs(next);
    res.json({ ok: true });
  });

  router.post('/scheduler/jobs/:id/run-now', async (req: Request, res: Response) => {
    const updated = await executeScheduledJobById(req.params.id, tryGetAiClient);
    if (!updated) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json({ job: updated });
  });

  router.get('/scheduler/notifications', (_req: Request, res: Response) => {
    res.json({ notifications: listSchedulerNotifications() });
  });

  router.post('/scheduler/notifications/read-all', (_req: Request, res: Response) => {
    const items = listSchedulerNotifications().map((n) => ({ ...n, read: true }));
    saveSchedulerNotifications(items);
    res.json({ notifications: items });
  });

  // ============================================================================
  // MODULE 11: NOVA FILE WORKSPACE – AI DOCUMENT SYNTHESIS HELPER
  // ============================================================================
  router.post('/files/ai-transform', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const { instruction, content = '', format = 'markdown' } = req.body ?? {};
      if (!instruction) {
        res.status(400).json({ error: 'Provide an instruction for document generation or transformation.' });
        return;
      }

      const cfg = {
        systemInstruction:
          'You are Nova File Workspace Engine. Produce well-structured sections, clean tables (if quantitative), and concise summaries suitable for PDF/DOCX/XLSX/PPTX export.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  heading: { type: Type.STRING },
                  body: { type: Type.STRING },
                },
                required: ['heading', 'body'],
              },
            },
            tableHeaders: { type: Type.ARRAY, items: { type: Type.STRING } },
            tableRows: {
              type: Type.ARRAY,
              items: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          required: ['title', 'summary', 'sections'],
        },
      };

      const resp = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Target Format: ${format}\nInstruction: ${String(instruction)}\n${
          content ? `\nSource Content:\n${String(content).slice(0, 20000)}` : ''
        }`,
        config: cfg,
      });

      res.json(JSON.parse((resp.text ?? '{}').trim()));
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      res.status(status).json({ error: message });
    }
  });

  // ============================================================================
  // MODULE 12: NOVA CONTROL – PERMISSIONS, APPROVALS, RATE LIMIT & AUDIT LOGS
  // ============================================================================
  router.get('/control/overview', (_req: Request, res: Response) => {
    const control = getControlState();
    const logs = getAuditLogs();
    res.json({
      toolPermissions: control.toolPermissions,
      rateLimitMaxPerMinute: control.rateLimitMaxPerMinute,
      rateLimitTelemetry,
      pendingApprovals: control.pendingApprovals,
      auditLogs: logs,
    });
  });

  router.post('/control/permissions', (req: Request, res: Response) => {
    const { toolKey, mode, rateLimitMaxPerMinute } = req.body ?? {};
    const ctrl = getControlState();
    if (toolKey && ['auto', 'ask', 'deny'].includes(String(mode))) {
      ctrl.toolPermissions[String(toolKey)] = mode as PermissionMode;
      appendAuditLog({
        module: 'control',
        action: 'update_permission',
        actor: 'user',
        outcome: 'executed',
        details: `${toolKey} -> ${mode}`,
      });
    }
    if (typeof rateLimitMaxPerMinute === 'number' && rateLimitMaxPerMinute >= 20 && rateLimitMaxPerMinute <= 300) {
      ctrl.rateLimitMaxPerMinute = Math.round(rateLimitMaxPerMinute);
    }
    saveControlState(ctrl);
    res.json({ ok: true, control: ctrl });
  });

  router.post('/control/audit', (req: Request, res: Response) => {
    const { module = 'workspace', action = 'event', outcome = 'executed', details = '' } = req.body ?? {};
    const entry = appendAuditLog({
      module: String(module).slice(0, 40),
      action: String(action).slice(0, 60),
      actor: 'client-user',
      outcome: ['allowed', 'blocked', 'pending', 'error', 'executed'].includes(String(outcome))
        ? (outcome as 'allowed' | 'blocked' | 'pending' | 'error' | 'executed')
        : 'executed',
      details: String(details).slice(0, 300),
    });
    res.json({ entry });
  });

  router.post('/control/approvals', (req: Request, res: Response) => {
    const { id, decision } = req.body ?? {};
    const ctrl = getControlState();
    ctrl.pendingApprovals = ctrl.pendingApprovals.map((p) =>
      p.id === id ? { ...p, status: decision === 'approve' ? 'approved' : 'cancelled' } : p
    );
    saveControlState(ctrl);
    appendAuditLog({
      module: 'control',
      action: decision === 'approve' ? 'approval_granted' : 'approval_cancelled',
      actor: 'user',
      outcome: decision === 'approve' ? 'allowed' : 'blocked',
      details: `Approval item ${id}`,
    });
    res.json({ pendingApprovals: ctrl.pendingApprovals });
  });

  return router;
}
