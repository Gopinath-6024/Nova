import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ensureUserVaultProfile, sanitizeFirestoreId } from './backgroundSync';
import type {
  LanguageProfileProgress,
  ProficiencyLevel,
  SupportedLanguageCode,
} from '../types/nova';

const VALID_LANG_CODES = new Set<SupportedLanguageCode>([
  'ja',
  'en',
  'ko',
  'fr',
  'de',
  'es',
  'zh',
  'it',
  'pt',
  'hi',
  'ta',
]);

const VALID_LEVELS = new Set<ProficiencyLevel>([
  'Absolute Beginner',
  'Beginner',
  'Elementary',
  'Intermediate',
  'Upper Intermediate',
  'Advanced',
]);

function safeLangCode(val: unknown, fallback: SupportedLanguageCode): SupportedLanguageCode {
  return typeof val === 'string' && VALID_LANG_CODES.has(val as SupportedLanguageCode)
    ? (val as SupportedLanguageCode)
    : fallback;
}

function safeLevel(val: unknown): ProficiencyLevel {
  return typeof val === 'string' && VALID_LEVELS.has(val as ProficiencyLevel)
    ? (val as ProficiencyLevel)
    : 'Absolute Beginner';
}

export async function pushLanguageProfileToCloud(
  user: User,
  profile: LanguageProfileProgress
): Promise<void> {
  if (!user?.emailVerified) return;
  const langId = sanitizeFirestoreId(profile.targetLanguage);
  await ensureUserVaultProfile(user, true);

  const path = `users/${user.uid}/languageProgress/${langId}`;
  const ref = doc(db, 'users', user.uid, 'languageProgress', langId);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const exists = existingSnap.exists();
  if (exists) {
    const cloudMs = Number(existingSnap.data()?.updatedAtMs ?? 0);
    if (cloudMs > profile.updatedAtMs) {
      return;
    }
  }

  const createdAt = exists ? existingSnap.data()?.createdAt : serverTimestamp();
  const payload = {
    id: langId,
    ownerId: user.uid,
    targetLanguage: safeLangCode(profile.targetLanguage, 'ja'),
    nativeLanguage: safeLangCode(profile.nativeLanguage, 'en'),
    level: safeLevel(profile.level),
    levelSelected: Boolean(profile.levelSelected),
    xp: Math.max(0, Math.min(10000000, Math.floor(profile.xp))),
    dailyXp: Math.max(0, Math.min(100000, Math.floor(profile.dailyXp))),
    dailyGoalXp: Math.max(10, Math.min(1000, Math.floor(profile.dailyGoalXp || 50))),
    streakDays: Math.max(0, Math.min(100000, Math.floor(profile.streakDays))),
    lastActiveDate: String(profile.lastActiveDate || new Date().toISOString().slice(0, 10)).slice(0, 16),
    hearts: Math.max(0, Math.min(10, Math.floor(profile.hearts))),
    practiceUnlimitedHearts: Boolean(profile.practiceUnlimitedHearts),
    completedLessonIds: profile.completedLessonIds.map((id) => String(id).slice(0, 128)).slice(0, 500),
    completedCheckpointIds: profile.completedCheckpointIds.map((id) => String(id).slice(0, 128)).slice(0, 100),
    unlockedUnitNumbers:
      profile.unlockedUnitNumbers.length > 0
        ? profile.unlockedUnitNumbers.map((n) => Math.max(1, Math.floor(Number(n) || 1))).slice(0, 50)
        : [1],
    updatedAtMs: Math.max(0, Math.floor(profile.updatedAtMs || Date.now())),
    createdAt,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function pullLanguageProfilesFromCloud(
  user: User
): Promise<Partial<Record<SupportedLanguageCode, Partial<LanguageProfileProgress>>>> {
  if (!user?.emailVerified) return {};
  const path = `users/${user.uid}/languageProgress`;
  let snap;
  try {
    const q = query(collection(db, 'users', user.uid, 'languageProgress'), where('ownerId', '==', user.uid));
    snap = await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  const out: Partial<Record<SupportedLanguageCode, Partial<LanguageProfileProgress>>> = {};
  for (const d of snap.docs) {
    const data = d.data();
    const code = safeLangCode(data.targetLanguage || d.id, 'ja');
    out[code] = {
      targetLanguage: code,
      nativeLanguage: safeLangCode(data.nativeLanguage, 'en'),
      level: safeLevel(data.level),
      levelSelected: Boolean(data.levelSelected),
      xp: Number(data.xp ?? 0),
      dailyXp: Number(data.dailyXp ?? 0),
      dailyGoalXp: Number(data.dailyGoalXp ?? 50),
      streakDays: Number(data.streakDays ?? 1),
      lastActiveDate: String(data.lastActiveDate || new Date().toISOString().slice(0, 10)),
      hearts: Number(data.hearts ?? 5),
      practiceUnlimitedHearts: Boolean(data.practiceUnlimitedHearts),
      completedLessonIds: Array.isArray(data.completedLessonIds) ? data.completedLessonIds.map(String) : [],
      completedCheckpointIds: Array.isArray(data.completedCheckpointIds)
        ? data.completedCheckpointIds.map(String)
        : [],
      unlockedUnitNumbers: Array.isArray(data.unlockedUnitNumbers)
        ? data.unlockedUnitNumbers.map(Number)
        : [1],
      updatedAtMs: Number(data.updatedAtMs ?? 0),
    };
  }
  return out;
}
