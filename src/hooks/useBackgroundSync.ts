import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  enqueueOutboxMutation,
  loadSyncOutbox,
  mapRemoteAlarmDoc,
  mapRemoteIndexedFileDoc,
  mapRemoteTaskDoc,
  mergeWithRemoteRecords,
  reconcileVaultWithCloud,
  sanitizeFirestoreId,
} from '../services/backgroundSync';
import type {
  AlarmItem,
  BackgroundSyncState,
  MobileIndexItem,
  SyncCollectionName,
  TaskItem,
} from '../types/nova';

interface UseBackgroundSyncOptions {
  isOnline: boolean;
  autoSync: boolean;
  strictOfflinePrivacy: boolean;
  tasks: TaskItem[];
  alarms: AlarmItem[];
  mobileIndex: MobileIndexItem[];
  onReconcileTasks: (next: TaskItem[]) => void;
  onReconcileAlarms: (next: AlarmItem[]) => void;
  onReconcileFiles: (next: MobileIndexItem[]) => void;
}

export function useBackgroundSync({
  isOnline,
  autoSync,
  strictOfflinePrivacy,
  tasks,
  alarms,
  mobileIndex,
  onReconcileTasks,
  onReconcileAlarms,
  onReconcileFiles,
}: UseBackgroundSyncOptions) {
  const [cloudUser, setCloudUser] = useState<User | null>(() => auth.currentUser);
  const [authLoading, setAuthLoading] = useState(true);
  const [vaultReadyUid, setVaultReadyUid] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<BackgroundSyncState>(() => ({
    status: auth.currentUser ? (isOnline ? 'idle' : 'offline') : 'signed_out',
    pendingCount: loadSyncOutbox().length,
    lastSyncedAt: null,
    lastSummary: null,
    errorMessage: null,
  }));

  const tasksRef = useRef(tasks);
  const alarmsRef = useRef(alarms);
  const filesRef = useRef(mobileIndex);
  const callbacksRef = useRef({
    onReconcileTasks,
    onReconcileAlarms,
    onReconcileFiles,
  });

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    alarmsRef.current = alarms;
  }, [alarms]);
  useEffect(() => {
    filesRef.current = mobileIndex;
  }, [mobileIndex]);
  useEffect(() => {
    callbacksRef.current = {
      onReconcileTasks,
      onReconcileAlarms,
      onReconcileFiles,
    };
  }, [onReconcileAlarms, onReconcileFiles, onReconcileTasks]);

  const isReconcilingRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const wasOnlineRef = useRef(isOnline);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCloudUser(u);
      setAuthLoading(false);
      if (!u) {
        setVaultReadyUid(null);
        setSyncState((prev) => ({
          ...prev,
          status: 'signed_out',
          pendingCount: loadSyncOutbox().length,
          errorMessage: null,
        }));
      }
    });
    return () => unsub();
  }, []);

  const reconcileNow = useCallback(async () => {
    const activeUser = auth.currentUser;
    if (!activeUser) {
      setSyncState((prev) => ({
        ...prev,
        status: 'signed_out',
        pendingCount: loadSyncOutbox().length,
      }));
      return;
    }

    if (strictOfflinePrivacy || !autoSync) {
      setSyncState((prev) => ({
        ...prev,
        status: 'paused',
        pendingCount: loadSyncOutbox().length,
      }));
      return;
    }

    if (!navigator.onLine) {
      setSyncState((prev) => ({
        ...prev,
        status: 'offline',
        pendingCount: loadSyncOutbox().length,
      }));
      return;
    }

    if (isReconcilingRef.current) return;
    isReconcilingRef.current = true;

    setSyncState((prev) => ({
      ...prev,
      status: 'syncing',
      errorMessage: null,
    }));

    try {
      const result = await reconcileVaultWithCloud({
        user: activeUser,
        autoSync,
        localTasks: tasksRef.current,
        localAlarms: alarmsRef.current,
        localFiles: filesRef.current,
      });

      callbacksRef.current.onReconcileTasks(result.tasks);
      callbacksRef.current.onReconcileAlarms(result.alarms);
      callbacksRef.current.onReconcileFiles(result.indexedFiles);
      setVaultReadyUid(activeUser.uid);

      const timeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      setSyncState({
        status: 'idle',
        pendingCount: result.remainingOutboxCount,
        lastSyncedAt: timeStr,
        lastSummary: `${result.tasks.length} tasks · ${result.alarms.length} alarms · ${result.indexedFiles.length} files`,
        errorMessage: null,
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Cloud sync encountered an error.';
      let friendlyMsg = rawMsg;
      try {
        const parsed = JSON.parse(rawMsg) as { error?: string };
        if (parsed?.error) friendlyMsg = parsed.error;
      } catch {
        // plain error string
      }
      setSyncState((prev) => ({
        ...prev,
        status: 'error',
        pendingCount: loadSyncOutbox().length,
        errorMessage: friendlyMsg,
      }));
    } finally {
      isReconcilingRef.current = false;
    }
  }, [autoSync, strictOfflinePrivacy]);

  // Trigger reconciliation when signing in, returning online, turning autoSync back on, or exiting strict offline privacy
  useEffect(() => {
    if (!cloudUser) return;

    if (strictOfflinePrivacy || !autoSync) {
      setSyncState((prev) => ({
        ...prev,
        status: 'paused',
        pendingCount: loadSyncOutbox().length,
      }));
      wasOnlineRef.current = isOnline;
      return;
    }

    if (!isOnline) {
      setSyncState((prev) => ({
        ...prev,
        status: 'offline',
        pendingCount: loadSyncOutbox().length,
      }));
      wasOnlineRef.current = false;
      return;
    }

    const justRestored = !wasOnlineRef.current && isOnline;
    wasOnlineRef.current = isOnline;

    if (justRestored || vaultReadyUid !== cloudUser.uid || loadSyncOutbox().length > 0) {
      void reconcileNow();
    }
  }, [autoSync, cloudUser, isOnline, reconcileNow, strictOfflinePrivacy, vaultReadyUid]);

  // Listen directly to browser online & tab focus events for automatic connection-restored reconciliation
  useEffect(() => {
    const handleConnectionRestored = () => {
      if (auth.currentUser && navigator.onLine && autoSync && !strictOfflinePrivacy) {
        void reconcileNow();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleConnectionRestored();
      }
    };

    window.addEventListener('online', handleConnectionRestored);
    document.addEventListener('visibilitychange', handleVisibility);
    const periodic = window.setInterval(() => {
      if (
        auth.currentUser &&
        navigator.onLine &&
        autoSync &&
        !strictOfflinePrivacy &&
        loadSyncOutbox().length > 0
      ) {
        void reconcileNow();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleConnectionRestored);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(periodic);
    };
  }, [autoSync, reconcileNow, strictOfflinePrivacy]);

  // Real-time cloud listeners once parent vault profile exists
  useEffect(() => {
    if (!cloudUser || vaultReadyUid !== cloudUser.uid || !autoSync || strictOfflinePrivacy) {
      return;
    }

    const uid = cloudUser.uid;
    const tasksPath = `users/${uid}/tasks`;
    const alarmsPath = `users/${uid}/alarms`;
    const filesPath = `users/${uid}/indexedFiles`;

    const unsubTasks = onSnapshot(
      query(collection(db, 'users', uid, 'tasks'), where('ownerId', '==', uid)),
      (snapshot) => {
        if (isReconcilingRef.current) return;
        const remote = snapshot.docs.map(mapRemoteTaskDoc);
        const outboxKeys = new Set(loadSyncOutbox().map((m) => m.key));
        const localFiltered = tasksRef.current;
        const { merged } = mergeWithRemoteRecords(localFiltered, remote);
        // Preserve pending delete tombstones from re-appearing before flush
        const cleaned = merged.filter((t) => {
          const mut = loadSyncOutbox().find(
            (m) => m.key === `tasks:${sanitizeFirestoreId(t.id)}`
          );
          return !(mut?.op === 'delete' && outboxKeys.has(mut.key));
        });
        callbacksRef.current.onReconcileTasks(cleaned);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, tasksPath);
      }
    );

    const unsubAlarms = onSnapshot(
      query(collection(db, 'users', uid, 'alarms'), where('ownerId', '==', uid)),
      (snapshot) => {
        if (isReconcilingRef.current) return;
        const remote = snapshot.docs.map(mapRemoteAlarmDoc);
        const outbox = loadSyncOutbox();
        const { merged } = mergeWithRemoteRecords(alarmsRef.current, remote);
        const cleaned = merged.filter((a) => {
          const mut = outbox.find((m) => m.key === `alarms:${sanitizeFirestoreId(a.id)}`);
          return mut?.op !== 'delete';
        });
        callbacksRef.current.onReconcileAlarms(cleaned);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, alarmsPath);
      }
    );

    const unsubFiles = onSnapshot(
      query(collection(db, 'users', uid, 'indexedFiles'), where('ownerId', '==', uid)),
      (snapshot) => {
        if (isReconcilingRef.current) return;
        const remote = snapshot.docs.map(mapRemoteIndexedFileDoc);
        const outbox = loadSyncOutbox();
        const { merged } = mergeWithRemoteRecords(filesRef.current, remote);
        const cleaned = merged.filter((f) => {
          const mut = outbox.find(
            (m) => m.key === `indexedFiles:${sanitizeFirestoreId(f.id)}`
          );
          return mut?.op !== 'delete';
        });
        callbacksRef.current.onReconcileFiles(cleaned);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, filesPath);
      }
    );

    return () => {
      unsubTasks();
      unsubAlarms();
      unsubFiles();
    };
  }, [autoSync, cloudUser, strictOfflinePrivacy, vaultReadyUid]);

  const queueSyncMutation = useCallback(
    (
      col: SyncCollectionName,
      docId: string,
      op: 'upsert' | 'delete',
      updatedAtMs: number,
      payload?: TaskItem | AlarmItem | MobileIndexItem
    ) => {
      const nextOutbox = enqueueOutboxMutation({
        key: `${col}:${sanitizeFirestoreId(docId)}`,
        collection: col,
        docId,
        op,
        updatedAtMs,
        payload,
      });

      setSyncState((prev) => ({
        ...prev,
        pendingCount: nextOutbox.length,
        status: !auth.currentUser
          ? 'signed_out'
          : !navigator.onLine
            ? 'offline'
            : strictOfflinePrivacy || !autoSync
              ? 'paused'
              : prev.status,
      }));

      if (auth.currentUser && navigator.onLine && autoSync && !strictOfflinePrivacy) {
        if (debounceTimerRef.current) {
          window.clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = window.setTimeout(() => {
          void reconcileNow();
        }, 550);
      }
    },
    [autoSync, reconcileNow, strictOfflinePrivacy]
  );

  const signInWithGoogle = useCallback(async () => {
    try {
      setSyncState((prev) => ({ ...prev, errorMessage: null }));
      await signInWithPopup(auth, googleProvider);
      window.setTimeout(() => {
        void reconcileNow();
      }, 150);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in was cancelled.';
      setSyncState((prev) => ({ ...prev, errorMessage: msg }));
    }
  }, [reconcileNow]);

  const signOutCloud = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sign out.';
      setSyncState((prev) => ({ ...prev, errorMessage: msg }));
    }
  }, []);

  return {
    cloudUser,
    authLoading,
    syncState,
    queueSyncMutation,
    reconcileNow,
    signInWithGoogle,
    signOutCloud,
  };
}
