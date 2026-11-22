import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AlarmItem,
  MobileIndexItem,
  SyncCollectionName,
  SyncOutboxMutation,
  TaskItem,
} from '../types/nova';

const OUTBOX_STORAGE_KEY = 'nova_sync_outbox_v1';
const ALLOWED_REPEAT_DAYS = new Set([
  'Daily',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
  'Weekdays',
  'Weekends',
]);
const ALLOWED_PRIORITIES = new Set<TaskItem['priority']>(['high', 'medium', 'low']);
const ALLOWED_CATEGORIES = new Set<TaskItem['category']>(['work', 'personal', 'alarm', 'health']);
const ALLOWED_FILE_TYPES = new Set<MobileIndexItem['type']>([
  'app',
  'file',
  'contact',
  'note',
  'setting',
  'pdf',
  'image',
]);

export function sanitizeFirestoreId(rawId: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 128);
  return cleaned || `item_${Date.now()}`;
}

export function loadSyncOutbox(): SyncOutboxMutation[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSyncOutbox(items: SyncOutboxMutation[]): void {
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items.slice(-250)));
  } catch {
    // ignore storage quota issue
  }
}

export function enqueueOutboxMutation(mutation: SyncOutboxMutation): SyncOutboxMutation[] {
  const current = loadSyncOutbox();
  const safeId = sanitizeFirestoreId(mutation.docId);
  const key = `${mutation.collection}:${safeId}`;
  const filtered = current.filter((item) => item.key !== key);
  const next: SyncOutboxMutation[] = [
    ...filtered,
    {
      ...mutation,
      key,
      docId: safeId,
    },
  ];
  saveSyncOutbox(next);
  return next;
}

function normalizeTime24(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const h = Math.min(23, Math.max(0, Number(m[1])));
    const min = Math.min(59, Math.max(0, Number(m[2])));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return '07:00';
}

function normalizeRepeatDays(days: string[] | undefined): string[] {
  if (!Array.isArray(days) || days.length === 0) return ['Daily'];
  const valid = Array.from(
    new Set(days.map((d) => String(d).trim()).filter((d) => ALLOWED_REPEAT_DAYS.has(d)))
  ).slice(0, 7);
  return valid.length > 0 ? valid : ['Daily'];
}

function buildTaskFirestoreDoc(
  uid: string,
  task: TaskItem,
  opts: { deleted: boolean; updatedAtMs: number; createdAt: unknown }
): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(task.id);
  const docData: Record<string, unknown> = {
    id: safeId,
    ownerId: uid,
    title: String(task.title || 'Untitled task').trim().slice(0, 240) || 'Untitled task',
    dueTime: String(task.dueTime || 'Today').trim().slice(0, 80) || 'Today',
    priority: ALLOWED_PRIORITIES.has(task.priority) ? task.priority : 'medium',
    category: ALLOWED_CATEGORIES.has(task.category) ? task.category : 'personal',
    completed: Boolean(task.completed),
    updatedAtMs: Math.max(0, Math.floor(opts.updatedAtMs)),
    deleted: opts.deleted,
    createdAt: opts.createdAt,
    updatedAt: serverTimestamp(),
  };
  if (typeof task.proactiveNote === 'string' && task.proactiveNote.trim().length > 0) {
    docData.proactiveNote = task.proactiveNote.trim().slice(0, 300);
  }
  return docData;
}

function buildAlarmFirestoreDoc(
  uid: string,
  alarm: AlarmItem,
  opts: { deleted: boolean; updatedAtMs: number; createdAt: unknown }
): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(alarm.id);
  const docData: Record<string, unknown> = {
    id: safeId,
    ownerId: uid,
    time24: normalizeTime24(alarm.time24),
    label: String(alarm.label || 'Nova Alarm').trim().slice(0, 120) || 'Nova Alarm',
    enabled: Boolean(alarm.enabled),
    repeatDays: normalizeRepeatDays(alarm.repeatDays),
    updatedAtMs: Math.max(0, Math.floor(opts.updatedAtMs)),
    deleted: opts.deleted,
    createdAt: opts.createdAt,
    updatedAt: serverTimestamp(),
  };
  if (typeof alarm.lastTriggeredDate === 'string' && alarm.lastTriggeredDate.trim().length > 0) {
    docData.lastTriggeredDate = alarm.lastTriggeredDate.trim().slice(0, 16);
  }
  return docData;
}

function buildIndexedFileFirestoreDoc(
  uid: string,
  item: MobileIndexItem,
  opts: { deleted: boolean; updatedAtMs: number; createdAt: unknown }
): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(item.id);
  const docData: Record<string, unknown> = {
    id: safeId,
    ownerId: uid,
    title: String(item.title || 'Untitled item').trim().slice(0, 200) || 'Untitled item',
    subtitle: String(item.subtitle || 'Indexed item').trim().slice(0, 240) || 'Indexed item',
    type: ALLOWED_FILE_TYPES.has(item.type) ? item.type : 'file',
    sizeOrMeta: String(item.sizeOrMeta || 'File').trim().slice(0, 64) || 'File',
    updatedAtLabel: String(item.updatedAt || 'Just now').trim().slice(0, 64) || 'Just now',
    updatedAtMs: Math.max(0, Math.floor(opts.updatedAtMs)),
    deleted: opts.deleted,
    createdAt: opts.createdAt,
    updatedAt: serverTimestamp(),
  };
  if (typeof item.contentPreview === 'string' && item.contentPreview.trim().length > 0) {
    docData.contentPreview = item.contentPreview.trim().slice(0, 500);
  }
  return docData;
}

export async function ensureUserVaultProfile(user: User, autoSync: boolean): Promise<void> {
  const path = `users/${user.uid}`;
  const vaultRef = doc(db, 'users', user.uid);
  let snap;
  try {
    snap = await getDoc(vaultRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const cleanName = user.displayName ? user.displayName.trim().slice(0, 120) : '';
  if (!snap.exists()) {
    const profile: Record<string, unknown> = {
      ownerId: user.uid,
      autoSync: Boolean(autoSync),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanName) profile.displayName = cleanName;
    try {
      await setDoc(vaultRef, profile);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  const existing = snap.data();
  if (existing?.autoSync !== Boolean(autoSync)) {
    try {
      await updateDoc(vaultRef, {
        autoSync: Boolean(autoSync),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

async function flushOutboxMutation(uid: string, mutation: SyncOutboxMutation): Promise<void> {
  const safeId = sanitizeFirestoreId(mutation.docId);
  const path = `users/${uid}/${mutation.collection}/${safeId}`;
  const ref = doc(db, 'users', uid, mutation.collection, safeId);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (mutation.op === 'delete') {
    if (!existingSnap.exists()) {
      return;
    }
    const cloudMs = Number(existingSnap.data()?.updatedAtMs ?? 0);
    if (cloudMs > mutation.updatedAtMs && existingSnap.data()?.deleted === false) {
      return;
    }
    try {
      await updateDoc(ref, {
        deleted: true,
        updatedAtMs: Math.max(mutation.updatedAtMs, cloudMs + 1),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  if (!mutation.payload) return;

  const exists = existingSnap.exists();
  if (exists) {
    const cloudMs = Number(existingSnap.data()?.updatedAtMs ?? 0);
    if (cloudMs > mutation.updatedAtMs) {
      return;
    }
  }

  const createdAtValue = exists ? existingSnap.data()?.createdAt : serverTimestamp();
  let docData: Record<string, unknown>;
  if (mutation.collection === 'tasks') {
    docData = buildTaskFirestoreDoc(uid, mutation.payload as TaskItem, {
      deleted: false,
      updatedAtMs: mutation.updatedAtMs,
      createdAt: createdAtValue,
    });
  } else if (mutation.collection === 'alarms') {
    docData = buildAlarmFirestoreDoc(uid, mutation.payload as AlarmItem, {
      deleted: false,
      updatedAtMs: mutation.updatedAtMs,
      createdAt: createdAtValue,
    });
  } else {
    docData = buildIndexedFileFirestoreDoc(uid, mutation.payload as MobileIndexItem, {
      deleted: false,
      updatedAtMs: mutation.updatedAtMs,
      createdAt: createdAtValue,
    });
  }

  try {
    await setDoc(ref, docData);
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export function mapRemoteTaskDoc(d: QueryDocumentSnapshot): {
  item: TaskItem;
  deleted: boolean;
  updatedAtMs: number;
} {
  const data = d.data();
  const updatedAtMs = Number(data.updatedAtMs ?? 0);
  return {
    item: {
      id: String(data.id || d.id),
      title: String(data.title || 'Untitled task'),
      dueTime: String(data.dueTime || 'Today'),
      priority: ALLOWED_PRIORITIES.has(data.priority) ? data.priority : 'medium',
      category: ALLOWED_CATEGORIES.has(data.category) ? data.category : 'personal',
      completed: Boolean(data.completed),
      ...(typeof data.proactiveNote === 'string' && data.proactiveNote
        ? { proactiveNote: data.proactiveNote }
        : {}),
      updatedAtMs,
    },
    deleted: Boolean(data.deleted),
    updatedAtMs,
  };
}

export function mapRemoteAlarmDoc(d: QueryDocumentSnapshot): {
  item: AlarmItem;
  deleted: boolean;
  updatedAtMs: number;
} {
  const data = d.data();
  const updatedAtMs = Number(data.updatedAtMs ?? 0);
  return {
    item: {
      id: String(data.id || d.id),
      time24: normalizeTime24(String(data.time24 || '07:00')),
      label: String(data.label || 'Nova Alarm'),
      enabled: Boolean(data.enabled),
      repeatDays: normalizeRepeatDays(data.repeatDays),
      ...(typeof data.lastTriggeredDate === 'string' && data.lastTriggeredDate
        ? { lastTriggeredDate: data.lastTriggeredDate }
        : {}),
      updatedAtMs,
    },
    deleted: Boolean(data.deleted),
    updatedAtMs,
  };
}

export function mapRemoteIndexedFileDoc(d: QueryDocumentSnapshot): {
  item: MobileIndexItem;
  deleted: boolean;
  updatedAtMs: number;
} {
  const data = d.data();
  const updatedAtMs = Number(data.updatedAtMs ?? 0);
  return {
    item: {
      id: String(data.id || d.id),
      title: String(data.title || 'Untitled file'),
      subtitle: String(data.subtitle || 'Indexed file'),
      type: ALLOWED_FILE_TYPES.has(data.type) ? data.type : 'file',
      sizeOrMeta: String(data.sizeOrMeta || 'File'),
      updatedAt: String(data.updatedAtLabel || 'Synced'),
      ...(typeof data.contentPreview === 'string' && data.contentPreview
        ? { contentPreview: data.contentPreview }
        : {}),
      updatedAtMs,
    },
    deleted: Boolean(data.deleted),
    updatedAtMs,
  };
}

async function fetchCollectionDocs(uid: string, colName: SyncCollectionName) {
  const path = `users/${uid}/${colName}`;
  try {
    const q = query(collection(db, 'users', uid, colName), where('ownerId', '==', uid));
    return await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function mergeWithRemoteRecords<T extends { id: string; updatedAtMs?: number }>(
  localItems: T[],
  remoteRecords: Array<{ item: T; deleted: boolean; updatedAtMs: number }>
): { merged: T[]; localOnlyToPush: T[] } {
  const remoteById = new Map<string, { item: T; deleted: boolean; updatedAtMs: number }>();
  for (const r of remoteRecords) {
    remoteById.set(sanitizeFirestoreId(r.item.id), r);
  }

  const localById = new Map<string, T>();
  for (const l of localItems) {
    localById.set(sanitizeFirestoreId(l.id), l);
  }

  const merged: T[] = [];
  const localOnlyToPush: T[] = [];
  const handled = new Set<string>();

  for (const local of localItems) {
    const key = sanitizeFirestoreId(local.id);
    handled.add(key);
    const remote = remoteById.get(key);
    const localMs = local.updatedAtMs ?? 0;

    if (!remote) {
      merged.push(local);
      localOnlyToPush.push(local);
      continue;
    }

    if (remote.deleted) {
      if (localMs > remote.updatedAtMs) {
        merged.push(local);
        localOnlyToPush.push(local);
      }
      continue;
    }

    if (localMs > remote.updatedAtMs) {
      merged.push(local);
      localOnlyToPush.push(local);
    } else {
      merged.push(remote.item);
    }
  }

  for (const [key, remote] of remoteById.entries()) {
    if (handled.has(key) || remote.deleted) continue;
    merged.push(remote.item);
  }

  return { merged, localOnlyToPush };
}

export interface ReconcileParams {
  user: User;
  autoSync: boolean;
  localTasks: TaskItem[];
  localAlarms: AlarmItem[];
  localFiles: MobileIndexItem[];
}

export interface ReconcileResult {
  tasks: TaskItem[];
  alarms: AlarmItem[];
  indexedFiles: MobileIndexItem[];
  pushedCount: number;
  pulledCount: number;
  remainingOutboxCount: number;
}

export async function reconcileVaultWithCloud(params: ReconcileParams): Promise<ReconcileResult> {
  const { user, autoSync, localTasks, localAlarms, localFiles } = params;
  await ensureUserVaultProfile(user, autoSync);

  // 1. Flush queued offline mutations first
  const outbox = loadSyncOutbox();
  let pushedCount = 0;
  const remaining: SyncOutboxMutation[] = [];

  for (let i = 0; i < outbox.length; i++) {
    const mut = outbox[i];
    await flushOutboxMutation(user.uid, mut);
    pushedCount += 1;
  }
  saveSyncOutbox(remaining);

  // 2. Pull latest cloud collections (owner-scoped queries matching security rules)
  const [taskSnap, alarmSnap, fileSnap] = await Promise.all([
    fetchCollectionDocs(user.uid, 'tasks'),
    fetchCollectionDocs(user.uid, 'alarms'),
    fetchCollectionDocs(user.uid, 'indexedFiles'),
  ]);

  const remoteTasks = taskSnap.docs.map(mapRemoteTaskDoc);
  const remoteAlarms = alarmSnap.docs.map(mapRemoteAlarmDoc);
  const remoteFiles = fileSnap.docs.map(mapRemoteIndexedFileDoc);

  const taskMerge = mergeWithRemoteRecords(localTasks, remoteTasks);
  const alarmMerge = mergeWithRemoteRecords(localAlarms, remoteAlarms);
  const fileMerge = mergeWithRemoteRecords(localFiles, remoteFiles);

  // 3. Seed/push any local-only or newer local records missing from cloud
  const now = Date.now();
  for (const t of taskMerge.localOnlyToPush) {
    await flushOutboxMutation(user.uid, {
      key: `tasks:${sanitizeFirestoreId(t.id)}`,
      collection: 'tasks',
      docId: t.id,
      op: 'upsert',
      updatedAtMs: t.updatedAtMs ?? now,
      payload: t,
    });
    pushedCount += 1;
  }

  for (const a of alarmMerge.localOnlyToPush) {
    await flushOutboxMutation(user.uid, {
      key: `alarms:${sanitizeFirestoreId(a.id)}`,
      collection: 'alarms',
      docId: a.id,
      op: 'upsert',
      updatedAtMs: a.updatedAtMs ?? now,
      payload: a,
    });
    pushedCount += 1;
  }

  for (const f of fileMerge.localOnlyToPush) {
    await flushOutboxMutation(user.uid, {
      key: `indexedFiles:${sanitizeFirestoreId(f.id)}`,
      collection: 'indexedFiles',
      docId: f.id,
      op: 'upsert',
      updatedAtMs: f.updatedAtMs ?? now,
      payload: f,
    });
    pushedCount += 1;
  }

  const pulledCount =
    remoteTasks.filter((r) => !r.deleted).length +
    remoteAlarms.filter((r) => !r.deleted).length +
    remoteFiles.filter((r) => !r.deleted).length;

  return {
    tasks: taskMerge.merged,
    alarms: alarmMerge.merged,
    indexedFiles: fileMerge.merged,
    pushedCount,
    pulledCount,
    remainingOutboxCount: 0,
  };
}
