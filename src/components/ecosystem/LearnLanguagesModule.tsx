import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Flame,
  Globe,
  GraduationCap,
  Heart,
  HelpCircle,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  createDefaultLanguageProfile,
  getBaseUnitsForLanguage,
  getLanguageMeta,
  JAPANESE_HIRAGANA,
  JAPANESE_KANJI,
  JAPANESE_KATAKANA,
  OTHER_LANGUAGE_SCRIPTS,
  PROFICIENCY_LEVELS,
  SUPPORTED_LANGUAGES,
} from '../../data/languageCurriculum';
import {
  pullLanguageProfilesFromCloud,
  pushLanguageProfileToCloud,
} from '../../services/languageSync';
import type {
  CurriculumUnit,
  KanaOrScriptItem,
  LanguageLesson,
  LanguageProfileProgress,
  LanguageTutorMessage,
  LearnLanguagesState,
  LessonExercise,
  ProficiencyLevel,
  SupportedLanguageCode,
} from '../../types/nova';

const STORAGE_KEY = 'nova_learn_languages_v1';

type SubTab = 'path' | 'tutor' | 'scripts' | 'speaking_lab' | 'settings';
type JapaneseScriptTab = 'Hiragana' | 'Katakana' | 'Kanji' | 'Vocab';

interface LearnLanguagesModuleProps {
  cloudUser: User | null;
  isOffline: boolean;
}

const ROLEPLAY_SCENARIOS = [
  'Free Practice & Grammar Coaching',
  'Ordering Food & Drinks at a Cafe',
  'Asking Directions at a Train Station',
  'Warm Self-Introduction & Small Talk',
  'Travel Hotel Check-In',
  'Job Interview & Polite Honorifics',
];

function loadInitialState(): LearnLanguagesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LearnLanguagesState;
      if (parsed && parsed.activeTargetLanguage && parsed.profiles) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupted storage
  }
  const initialTarget: SupportedLanguageCode = 'ja';
  const initialNative: SupportedLanguageCode = 'en';
  return {
    nativeLanguage: initialNative,
    activeTargetLanguage: initialTarget,
    showRomanization: true,
    autoPlayAudio: false,
    ttsSpeed: 'normal',
    profiles: {
      [initialTarget]: createDefaultLanguageProfile(initialTarget, initialNative),
    },
  };
}

function normalizeCompare(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[。、.,!?！？「」"'’\s-]+/g, '')
    .trim();
}

export const LearnLanguagesModule: React.FC<LearnLanguagesModuleProps> = ({
  cloudUser,
  isOffline,
}) => {
  const [state, setState] = useState<LearnLanguagesState>(loadInitialState);
  const [subTab, setSubTab] = useState<SubTab>('path');
  const [jaScriptTab, setJaScriptTab] = useState<JapaneseScriptTab>('Hiragana');
  const [selectedKana, setSelectedKana] = useState<KanaOrScriptItem | null>(null);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Active lesson runner state
  const [activeLesson, setActiveLesson] = useState<LanguageLesson | null>(null);
  const [exIndex, setExIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [builtTokens, setBuiltTokens] = useState<number[]>([]);
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [leftPickId, setLeftPickId] = useState<string | null>(null);
  const [wrongMatchFlash, setWrongMatchFlash] = useState(false);

  const [exChecked, setExChecked] = useState<null | { correct: boolean; message: string }>(null);
  const [lessonMistakes, setLessonMistakes] = useState(0);
  const [lessonCompletedSummary, setLessonCompletedSummary] = useState<{
    xpEarned: number;
    accuracy: number;
    lessonTitle: string;
    unlockedNextUnit?: number;
  } | null>(null);

  // AI Teacher Explain inside exercise
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [aiExplainText, setAiExplainText] = useState<string | null>(null);

  // AI Path / Revision generator
  const [generatingUnit, setGeneratingUnit] = useState(false);
  const [customTopic, setCustomTopic] = useState('');
  const [generatingRevision, setGeneratingRevision] = useState(false);

  // AI Tutor chat
  const [scenario, setScenario] = useState(ROLEPLAY_SCENARIOS[0]);
  const [tutorInput, setTutorInput] = useState('');
  const [tutorSending, setTutorSending] = useState(false);

  // Speaking evaluation (inside lesson or Speaking Studio)
  const [recording, setRecording] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [speakingEvalResult, setSpeakingEvalResult] = useState<{
    transcript: string;
    score: number;
    passed: boolean;
    feedbackNative: string;
    tipTarget: string;
    improvedPhrase: string;
  } | null>(null);
  const [studioPhraseIndex, setStudioPhraseIndex] = useState(0);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const pulledCloudRef = useRef<string | null>(null);

  const targetCode = state.activeTargetLanguage;
  const nativeCode = state.nativeLanguage;
  const targetMeta = useMemo(() => getLanguageMeta(targetCode), [targetCode]);
  const nativeMeta = useMemo(() => getLanguageMeta(nativeCode), [nativeCode]);

  const activeProfile: LanguageProfileProgress = useMemo(() => {
    const existing = state.profiles[targetCode];
    if (existing) return existing;
    return createDefaultLanguageProfile(targetCode, nativeCode);
  }, [state.profiles, targetCode, nativeCode]);

  const allUnits: CurriculumUnit[] = useMemo(() => {
    const base = getBaseUnitsForLanguage(targetCode);
    const merged = [...base, ...(activeProfile.customUnits || [])];
    return merged.sort((a, b) => a.unitNumber - b.unitNumber);
  }, [targetCode, activeProfile.customUnits]);

  // Persist locally on every state update
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota
    }
  }, [state]);

  // Sync with Firebase Firestore when user signs in
  useEffect(() => {
    if (!cloudUser || !cloudUser.emailVerified || isOffline) return;
    if (pulledCloudRef.current === cloudUser.uid) return;
    pulledCloudRef.current = cloudUser.uid;

    void (async () => {
      try {
        const cloudProfiles = await pullLanguageProfilesFromCloud(cloudUser);
        if (Object.keys(cloudProfiles).length === 0) return;
        setState((prev) => {
          const nextProfiles = { ...prev.profiles };
          for (const [code, remote] of Object.entries(cloudProfiles) as Array<
            [SupportedLanguageCode, Partial<LanguageProfileProgress>]
          >) {
            const local =
              nextProfiles[code] || createDefaultLanguageProfile(code, prev.nativeLanguage);
            if ((remote.updatedAtMs ?? 0) > (local.updatedAtMs ?? 0)) {
              nextProfiles[code] = { ...local, ...remote };
            }
          }
          return { ...prev, profiles: nextProfiles };
        });
        setSyncNotice('Cloud progress synced');
      } catch {
        // fail gracefully; local progress stays intact
      }
    })();
  }, [cloudUser, isOffline]);

  const updateActiveProfile = useCallback(
    (updater: (prev: LanguageProfileProgress) => LanguageProfileProgress) => {
      setState((prev) => {
        const current =
          prev.profiles[prev.activeTargetLanguage] ??
          createDefaultLanguageProfile(prev.activeTargetLanguage, prev.nativeLanguage);
        const updated = {
          ...updater(current),
          nativeLanguage: prev.nativeLanguage,
          updatedAtMs: Date.now(),
        };
        if (cloudUser && cloudUser.emailVerified && !isOffline) {
          void pushLanguageProfileToCloud(cloudUser, updated).catch(() => {
            // background sync failure won't block UI
          });
        }
        return {
          ...prev,
          profiles: {
            ...prev.profiles,
            [prev.activeTargetLanguage]: updated,
          },
        };
      });
    },
    [cloudUser, isOffline]
  );

  // Switch target language without losing progress in other languages
  const handleSelectTargetLanguage = (newTarget: SupportedLanguageCode) => {
    setActiveLesson(null);
    setLessonCompletedSummary(null);
    setErrorBanner(null);
    setState((prev) => {
      const hasProfile = Boolean(prev.profiles[newTarget]);
      return {
        ...prev,
        activeTargetLanguage: newTarget,
        profiles: hasProfile
          ? prev.profiles
          : {
              ...prev.profiles,
              [newTarget]: createDefaultLanguageProfile(newTarget, prev.nativeLanguage),
            },
      };
    });
  };

  const handleSelectLevel = (level: ProficiencyLevel) => {
    updateActiveProfile((p) => {
      const unlocked = new Set(p.unlockedUnitNumbers);
      unlocked.add(1);
      if (level !== 'Absolute Beginner') unlocked.add(2);
      return {
        ...p,
        level,
        levelSelected: true,
        unlockedUnitNumbers: Array.from(unlocked).sort((a, b) => a - b),
      };
    });
  };

  // Speak target text via Gemini TTS (when online) with crisp Web Speech API fallback
  const playTargetAudio = useCallback(
    async (text: string, speedOverride?: 'normal' | 'slow') => {
      const clean = String(text || '').trim();
      if (!clean) return;
      const speed = speedOverride ?? state.ttsSpeed;
      setSpeakingText(clean);

      const fallbackBrowserTts = () => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(clean);
          utter.lang = targetMeta.bcp47;
          utter.rate = speed === 'slow' ? 0.65 : 0.98;
          utter.onend = () => setSpeakingText(null);
          utter.onerror = () => setSpeakingText(null);
          window.speechSynthesis.speak(utter);
        } else {
          setSpeakingText(null);
        }
      };

      if (isOffline) {
        fallbackBrowserTts();
        return;
      }

      try {
        const res = await fetch('/api/nova/languages/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            targetLanguage: targetCode,
            speed,
          }),
        });
        if (!res.ok) {
          fallbackBrowserTts();
          return;
        }
        const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
        if (!data.audioBase64) {
          fallbackBrowserTts();
          return;
        }
        if (activeAudioRef.current) {
          activeAudioRef.current.pause();
        }
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        activeAudioRef.current = audio;
        audio.playbackRate = speed === 'slow' ? 0.88 : 1.0;
        audio.onended = () => setSpeakingText(null);
        audio.onerror = () => fallbackBrowserTts();
        await audio.play();
      } catch {
        fallbackBrowserTts();
      }
    },
    [isOffline, state.ttsSpeed, targetCode, targetMeta.bcp47]
  );

  // Start interactive lesson
  const startLesson = (lesson: LanguageLesson) => {
    setErrorBanner(null);
    setActiveLesson(lesson);
    setExIndex(0);
    setSelectedOption('');
    setTypedAnswer('');
    setBuiltTokens([]);
    setMatchedPairIds([]);
    setLeftPickId(null);
    setExChecked(null);
    setLessonMistakes(0);
    setLessonCompletedSummary(null);
    setAiExplainText(null);
    setSpeakingEvalResult(null);
    setSubTab('path');

    const firstEx = lesson.exercises[0];
    if (state.autoPlayAudio && firstEx?.audioText) {
      void playTargetAudio(firstEx.audioText);
    }
  };

  const currentExercise: LessonExercise | null =
    activeLesson && activeLesson.exercises[exIndex] ? activeLesson.exercises[exIndex] : null;

  const shuffledRightPairs = useMemo(() => {
    if (!currentExercise?.matchPairs) return [];
    return [...currentExercise.matchPairs].sort((a, b) => a.right.localeCompare(b.right));
  }, [currentExercise]);

  const resetExerciseInputs = () => {
    setSelectedOption('');
    setTypedAnswer('');
    setBuiltTokens([]);
    setMatchedPairIds([]);
    setLeftPickId(null);
    setExChecked(null);
    setAiExplainText(null);
    setSpeakingEvalResult(null);
  };

  const handleMatchRightPick = (pairId: string) => {
    if (!leftPickId || matchedPairIds.includes(pairId) || exChecked) return;
    if (leftPickId === pairId) {
      const next = [...matchedPairIds, pairId];
      setMatchedPairIds(next);
      setLeftPickId(null);
      if (currentExercise?.matchPairs && next.length === currentExercise.matchPairs.length) {
        setExChecked({
          correct: true,
          message: `All ${next.length} pairs matched! ${currentExercise.grammarTip}`,
        });
      }
    } else {
      setWrongMatchFlash(true);
      setLeftPickId(null);
      setTimeout(() => setWrongMatchFlash(false), 450);
    }
  };

  const checkCurrentExercise = () => {
    if (!currentExercise || exChecked) return;
    let isCorrect = false;
    let learnerAttempt = '';

    if (currentExercise.kind === 'multiple_choice' || currentExercise.kind === 'listening') {
      learnerAttempt = selectedOption;
      isCorrect = selectedOption === currentExercise.correctAnswer;
    } else if (currentExercise.kind === 'sentence_builder') {
      const bank = currentExercise.wordBank || [];
      learnerAttempt = builtTokens.map((i) => bank[i] || '').join(' ').trim();
      isCorrect = normalizeCompare(learnerAttempt) === normalizeCompare(currentExercise.correctAnswer);
    } else if (currentExercise.kind === 'typing_translate') {
      learnerAttempt = typedAnswer.trim();
      const accepted = [
        currentExercise.correctAnswer,
        ...(currentExercise.acceptedAnswers || []),
      ].map(normalizeCompare);
      isCorrect = accepted.includes(normalizeCompare(learnerAttempt));
    } else if (currentExercise.kind === 'speaking') {
      learnerAttempt = speakingEvalResult?.transcript || typedAnswer.trim();
      if (speakingEvalResult) {
        isCorrect = speakingEvalResult.passed;
      } else {
        const accepted = [
          currentExercise.correctAnswer,
          ...(currentExercise.acceptedAnswers || []),
        ].map(normalizeCompare);
        isCorrect = accepted.includes(normalizeCompare(learnerAttempt));
      }
    } else if (currentExercise.kind === 'script_match') {
      isCorrect =
        (currentExercise.matchPairs?.length ?? 0) > 0 &&
        matchedPairIds.length === (currentExercise.matchPairs?.length ?? 0);
    }

    if (!isCorrect) {
      setLessonMistakes((m) => m + 1);
      updateActiveProfile((p) => ({
        ...p,
        hearts: p.practiceUnlimitedHearts ? p.hearts : Math.max(0, p.hearts - 1),
        mistakeExerciseIds: Array.from(new Set([...p.mistakeExerciseIds, currentExercise.id])).slice(-40),
      }));
    } else {
      updateActiveProfile((p) => ({
        ...p,
        mistakeExerciseIds: p.mistakeExerciseIds.filter((id) => id !== currentExercise.id),
      }));
    }

    setExChecked({
      correct: isCorrect,
      message: isCorrect
        ? currentExercise.grammarTip
        : `Correct answer: ${currentExercise.correctAnswer}. ${currentExercise.grammarTip}`,
    });
  };

  const advanceLesson = () => {
    if (!activeLesson) return;
    if (exIndex + 1 < activeLesson.exercises.length) {
      const nextIdx = exIndex + 1;
      setExIndex(nextIdx);
      resetExerciseInputs();
      const nextEx = activeLesson.exercises[nextIdx];
      if (state.autoPlayAudio && nextEx?.audioText) {
        void playTargetAudio(nextEx.audioText);
      }
      return;
    }

    // Lesson finished!
    const total = Math.max(1, activeLesson.exercises.length);
    const accuracy = Math.max(0, Math.round(((total - Math.min(total, lessonMistakes)) / total) * 100));
    const bonusXp = accuracy === 100 ? 10 : 0;
    const xpEarned = activeLesson.xpReward + bonusXp;
    const today = new Date().toISOString().slice(0, 10);

    let unlockedNextUnit: number | undefined;
    const parentUnit = allUnits.find((u) =>
      u.chapters.some((c) => c.lessons.some((l) => l.id === activeLesson.id))
    );

    updateActiveProfile((p) => {
      const sameDay = p.lastActiveDate === today;
      const completedLessons = Array.from(new Set([...p.completedLessonIds, activeLesson.id]));
      const completedCheckpoints =
        activeLesson.lessonKind === 'checkpoint'
          ? Array.from(new Set([...p.completedCheckpointIds, activeLesson.id]))
          : p.completedCheckpointIds;

      const nextUnits = new Set(p.unlockedUnitNumbers);
      if (activeLesson.lessonKind === 'checkpoint' && parentUnit) {
        const nextNum = parentUnit.unitNumber + 1;
        if (!nextUnits.has(nextNum)) unlockedNextUnit = nextNum;
        nextUnits.add(nextNum);
      } else if (parentUnit) {
        const unitLessonIds = parentUnit.chapters.flatMap((c) => c.lessons.map((l) => l.id));
        if (unitLessonIds.every((id) => completedLessons.includes(id))) {
          const nextNum = parentUnit.unitNumber + 1;
          if (!nextUnits.has(nextNum)) unlockedNextUnit = nextNum;
          nextUnits.add(nextNum);
        }
      }

      return {
        ...p,
        xp: p.xp + xpEarned,
        dailyXp: (sameDay ? p.dailyXp : 0) + xpEarned,
        streakDays: sameDay ? Math.max(1, p.streakDays) : p.streakDays + 1,
        lastActiveDate: today,
        completedLessonIds: completedLessons,
        completedCheckpointIds: completedCheckpoints,
        unlockedUnitNumbers: Array.from(nextUnits).sort((a, b) => a - b),
      };
    });

    setLessonCompletedSummary({
      xpEarned,
      accuracy,
      lessonTitle: activeLesson.title,
      unlockedNextUnit,
    });
  };

  // AI Teacher Explain inside exercise
  const handleExplainExercise = async () => {
    if (!currentExercise) return;
    if (isOffline) {
      setErrorBanner('AI Teacher explanations require an internet connection.');
      return;
    }
    setAiExplainLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/nova/languages/explain-exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: targetCode,
          nativeLanguage: nativeCode,
          level: activeProfile.level,
          promptNative: currentExercise.promptNative,
          promptTarget: currentExercise.promptTarget || currentExercise.audioText || '',
          userAnswer: selectedOption || typedAnswer || builtTokens.map((i) => currentExercise.wordBank?.[i]).join(' '),
          correctAnswer: currentExercise.correctAnswer,
        }),
      });
      const data = (await res.json()) as { explanation?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Unable to fetch AI explanation.');
      setAiExplainText(data.explanation || 'No explanation returned.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to reach AI Teacher.');
    } finally {
      setAiExplainLoading(false);
    }
  };

  // Generate personalized AI Unit
  const handleGenerateAiUnit = async () => {
    if (isOffline) {
      setErrorBanner('Generating personalized AI curriculum units requires an online connection.');
      return;
    }
    setGeneratingUnit(true);
    setErrorBanner(null);
    const nextUnitNum = (allUnits[allUnits.length - 1]?.unitNumber ?? 2) + 1;
    try {
      const res = await fetch('/api/nova/languages/generate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: targetCode,
          nativeLanguage: nativeCode,
          level: activeProfile.level,
          unitNumber: nextUnitNum,
          focusTopic: customTopic.trim(),
        }),
      });
      const data = (await res.json()) as { unit?: CurriculumUnit; error?: string };
      if (!res.ok || !data.unit) throw new Error(data.error || 'Could not generate unit.');

      updateActiveProfile((p) => ({
        ...p,
        customUnits: [...(p.customUnits || []), data.unit!],
        unlockedUnitNumbers: Array.from(new Set([...p.unlockedUnitNumbers, data.unit!.unitNumber])).sort((a, b) => a - b),
      }));
      setCustomTopic('');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to generate AI curriculum unit.');
    } finally {
      setGeneratingUnit(false);
    }
  };

  // Generate AI Revision session
  const handleGenerateRevisionLesson = async () => {
    if (isOffline) {
      setErrorBanner('AI revision session generation requires an online connection.');
      return;
    }
    setGeneratingRevision(true);
    setErrorBanner(null);
    try {
      const weakTerms = activeProfile.vocabBank
        .filter((v) => v.mistakeCount > 0 || v.mastery < 60)
        .slice(0, 6)
        .map((v) => `${v.term} (${v.meaning})`);
      const res = await fetch('/api/nova/languages/generate-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: targetCode,
          nativeLanguage: nativeCode,
          level: activeProfile.level,
          lessonKind: 'revision',
          focusSkill: targetCode === 'ja' ? 'Kanji, Particles, Listening & Speaking' : 'Mixed Review',
          weakTerms,
        }),
      });
      const data = (await res.json()) as { lesson?: LanguageLesson; error?: string };
      if (!res.ok || !data.lesson) throw new Error(data.error || 'Could not generate revision session.');
      startLesson(data.lesson);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to generate AI revision.');
    } finally {
      setGeneratingRevision(false);
    }
  };

  // Send message to AI Tutor & Roleplay partner
  const handleSendTutorMessage = async (textOverride?: string) => {
    const clean = (textOverride ?? tutorInput).trim();
    if (!clean || tutorSending) return;
    if (isOffline) {
      setErrorBanner('AI Tutor conversation requires an online connection.');
      return;
    }

    const userMsg: LanguageTutorMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      textTarget: clean,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const currentHistory = [...(activeProfile.tutorHistory || []), userMsg];
    updateActiveProfile((p) => ({
      ...p,
      tutorHistory: [...(p.tutorHistory || []), userMsg].slice(-30),
    }));
    if (!textOverride) setTutorInput('');
    setTutorSending(true);
    setErrorBanner(null);

    try {
      const res = await fetch('/api/nova/languages/tutor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: targetCode,
          nativeLanguage: nativeCode,
          level: activeProfile.level,
          scenario,
          message: clean,
          history: currentHistory.slice(-6),
        }),
      });
      const data = (await res.json()) as {
        textTarget?: string;
        phonetics?: string;
        translationNative?: string;
        correction?: string;
        grammarNotes?: string[];
        error?: string;
      };
      if (!res.ok || !data.textTarget) throw new Error(data.error || 'Tutor request failed.');

      const assistantMsg: LanguageTutorMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        textTarget: data.textTarget,
        phonetics: data.phonetics,
        translationNative: data.translationNative,
        correction: data.correction,
        grammarNotes: data.grammarNotes,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      updateActiveProfile((p) => ({
        ...p,
        xp: p.xp + 5,
        dailyXp: p.dailyXp + 5,
        tutorHistory: [...(p.tutorHistory || []), assistantMsg].slice(-30),
      }));

      if (state.autoPlayAudio) {
        void playTargetAudio(data.textTarget);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'AI Tutor failed to respond.');
    } finally {
      setTutorSending(false);
    }
  };

  // Microphone recording & real Gemini speaking evaluation
  const startRecordingForPhrase = async (expectedPhrase: string) => {
    setErrorBanner(null);
    setSpeakingEvalResult(null);
    if (isOffline) {
      setErrorBanner('Live microphone pronunciation scoring requires online connectivity.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorBanner('Microphone API unavailable in this browser. You can type your spoken attempt below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = String(reader.result || '');
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
          if (!base64) return;
          await evaluateSpokenPayload({
            audioBase64: base64,
            mimeType: blob.type || 'audio/webm',
            expectedPhrase,
          });
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setErrorBanner('Microphone permission denied or unavailable. Type your phonetic attempt to practice.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const evaluateSpokenPayload = async (payload: {
    audioBase64?: string;
    mimeType?: string;
    spokenTranscript?: string;
    expectedPhrase: string;
  }) => {
    setEvalLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/nova/languages/evaluate-speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          targetLanguage: targetCode,
          nativeLanguage: nativeCode,
          level: activeProfile.level,
        }),
      });
      const data = (await res.json()) as {
        transcript?: string;
        score?: number;
        passed?: boolean;
        feedbackNative?: string;
        tipTarget?: string;
        improvedPhrase?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Pronunciation check failed.');
      setSpeakingEvalResult({
        transcript: data.transcript || payload.spokenTranscript || '',
        score: data.score ?? 0,
        passed: Boolean(data.passed),
        feedbackNative: data.feedbackNative || '',
        tipTarget: data.tipTarget || '',
        improvedPhrase: data.improvedPhrase || payload.expectedPhrase,
      });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Speaking evaluation failed.');
    } finally {
      setEvalLoading(false);
    }
  };

  // Helpers for Script/Vocab SRS
  const updateVocabMastery = (cardId: string, delta: number) => {
    updateActiveProfile((p) => ({
      ...p,
      vocabBank: p.vocabBank.map((c) =>
        c.id === cardId
          ? {
              ...c,
              mastery: Math.max(0, Math.min(100, c.mastery + delta)),
              mistakeCount: delta < 0 ? c.mistakeCount + 1 : c.mistakeCount,
              dueAtMs: Date.now() + (delta > 0 ? 12 * 3600 * 1000 : 15 * 60 * 1000),
            }
          : c
      ),
    }));
  };

  // Studio speaking drills pulled from current language lessons
  const studioDrills = useMemo(() => {
    const items: Array<{ target: string; romanization?: string; meaning: string }> = [];
    for (const u of allUnits) {
      for (const ch of u.chapters) {
        for (const l of ch.lessons) {
          for (const ex of l.exercises) {
            const phrase = ex.audioText || ex.promptTarget;
            if (phrase) {
              items.push({
                target: phrase,
                romanization: ex.romanization,
                meaning: ex.promptNative,
              });
            }
          }
        }
      }
    }
    return items.length > 0
      ? items
      : [
          {
            target: targetMeta.greetingSample,
            romanization: targetMeta.greetingReading,
            meaning: `Standard greeting in ${targetMeta.name}`,
          },
        ];
  }, [allUnits, targetMeta]);

  const activeStudioDrill = studioDrills[studioPhraseIndex % studioDrills.length];

  // Check if lesson is unlocked progressively
  const isLessonUnlocked = (unitNumber: number, flatIdxInUnit: number, unitLessons: LanguageLesson[]) => {
    if (!activeProfile.unlockedUnitNumbers.includes(unitNumber)) return false;
    if (flatIdxInUnit === 0) return true;
    const prevLesson = unitLessons[flatIdxInUnit - 1];
    return prevLesson ? activeProfile.completedLessonIds.includes(prevLesson.id) : true;
  };

  const dailyPct = Math.min(
    100,
    Math.round((activeProfile.dailyXp / Math.max(10, activeProfile.dailyGoalXp)) * 100)
  );

  const activeLanguagesCount = Object.keys(state.profiles).length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <section className="rounded-3xl border border-violet-500/20 dark:border-violet-400/15 bg-white dark:bg-[#0D0917] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Learn Languages
                </h1>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {targetMeta.name} ({targetMeta.nativeName}) · Native: {nativeMeta.name} · {activeProfile.level}
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Interactive lessons, progressive units, script & kanji drills, listening & AI pronunciation teacher.
              </p>
            </div>
          </div>

          {/* Live Learner Stats */}
          <div className="flex flex-wrap items-center gap-4 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-300 tabular-nums">
              <Flame className="h-4 w-4" />
              <span>{activeProfile.streakDays}d streak</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 tabular-nums">
              <Award className="h-4 w-4" />
              <span>{activeProfile.xp} XP</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-300 tabular-nums">
              <Heart className="h-4 w-4" />
              <span>{activeProfile.practiceUnlimitedHearts ? 'Practice ∞' : `${activeProfile.hearts}/5`}</span>
            </div>
            <select
              aria-label="Switch target language"
              value={targetCode}
              onChange={(e) => handleSelectTargetLanguage(e.target.value as SupportedLanguageCode)}
              className="min-h-[40px] rounded-xl border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#140F24] px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  Learning: {lang.name} ({lang.nativeName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Daily Goal Bar + Sub-navigation */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 dark:border-white/10 pt-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Language Learning Sections">
            {(
              [
                { id: 'path', label: 'Learning Path', icon: <Compass className="h-4 w-4" /> },
                { id: 'tutor', label: 'AI Teacher Chat', icon: <MessageSquare className="h-4 w-4" /> },
                {
                  id: 'scripts',
                  label: targetCode === 'ja' ? 'Hiragana · Katakana · Kanji' : 'Script & Vocab',
                  icon: <Layers className="h-4 w-4" />,
                },
                { id: 'speaking_lab', label: 'Speaking & Audio', icon: <Mic className="h-4 w-4" /> },
                { id: 'settings', label: 'Languages & Settings', icon: <Settings className="h-4 w-4" /> },
              ] as Array<{ id: SubTab; label: string; icon: React.ReactNode }>
            ).map((tab) => {
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSubTab(tab.id)}
                  className={`flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-violet-600 text-white'
                      : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#130E22] text-slate-700 dark:text-slate-300 hover:border-violet-400/60'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5 min-w-[200px]">
            <div className="flex-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400 tabular-nums">
                <span>Daily Goal</span>
                <span>
                  {activeProfile.dailyXp}/{activeProfile.dailyGoalXp} XP ({dailyPct}%)
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${dailyPct}%` }}
                />
              </div>
            </div>
            {syncNotice && (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {syncNotice}
              </span>
            )}
          </div>
        </div>
      </section>

      {errorBanner && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-200"
        >
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            aria-label="Dismiss error"
            className="rounded-lg p-1 hover:bg-rose-500/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* First-Time Proficiency Level Prompt per Language */}
      {!activeProfile.levelSelected && !activeLesson && (
        <section className="rounded-3xl border border-violet-500/30 bg-white dark:bg-[#100B1E] p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Personalize your {targetMeta.name} Learning Path
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Tell Nova your current knowledge level so we unlock the right starting units and difficulty.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROFICIENCY_LEVELS.map((item) => (
              <button
                key={item.level}
                type="button"
                onClick={() => handleSelectLevel(item.level)}
                className="flex flex-col items-start text-left rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161028] p-4 hover:border-violet-500 transition-colors min-h-[96px]"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {item.level}
                  </span>
                  <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                    {item.badge}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{item.summary}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: LEARNING PATH & ACTIVE INTERACTIVE LESSON RUNNER               */}
      {/* ===================================================================== */}
      {subTab === 'path' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Primary Learning Stage */}
          <div className="lg:col-span-8 space-y-5">
            {lessonCompletedSummary ? (
              <section className="rounded-3xl border border-emerald-500/35 bg-white dark:bg-[#0D0917] p-6 sm:p-8 text-center space-y-5 shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Lesson Complete!
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {lessonCompletedSummary.lessonTitle}
                  </p>
                </div>
                <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] p-4">
                    <div className="text-xs text-slate-500 dark:text-slate-400">XP Earned</div>
                    <div className="mt-1 text-2xl font-bold text-violet-600 dark:text-violet-300 tabular-nums">
                      +{lessonCompletedSummary.xpEarned} XP
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] p-4">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Accuracy</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-300 tabular-nums">
                      {lessonCompletedSummary.accuracy}%
                    </div>
                  </div>
                </div>
                {lessonCompletedSummary.unlockedNextUnit && (
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Unit {lessonCompletedSummary.unlockedNextUnit} is now unlocked!
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActiveLesson(null);
                    setLessonCompletedSummary(null);
                  }}
                  className="min-h-[44px] rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
                >
                  Continue Learning Path
                </button>
              </section>
            ) : activeLesson && currentExercise ? (
              /* ---------------- ACTIVE INTERACTIVE LESSON RUNNER ---------------- */
              <section className="rounded-3xl border border-violet-500/25 bg-white dark:bg-[#0D0917] p-5 sm:p-7 shadow-sm space-y-6">
                {/* Runner Progress Header */}
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveLesson(null)}
                    aria-label="Exit lesson"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
                      <span>
                        {activeLesson.title} · {currentExercise.skill}
                      </span>
                      <span>
                        Step {exIndex + 1} / {activeLesson.exercises.length}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                      <div
                        className="h-full bg-violet-600 transition-all duration-300"
                        style={{
                          width: `${Math.round(((exIndex + (exChecked ? 1 : 0)) / activeLesson.exercises.length) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Exercise Prompt */}
                <div className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    {currentExercise.promptNative}
                  </h2>

                  {(currentExercise.promptTarget || currentExercise.audioText) && (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] p-4">
                      {currentExercise.kind !== 'listening' && currentExercise.promptTarget && (
                        <div>
                          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                            {currentExercise.promptTarget}
                          </div>
                          {state.showRomanization && currentExercise.romanization && (
                            <div className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
                              {currentExercise.romanization}
                            </div>
                          )}
                        </div>
                      )}
                      {currentExercise.audioText && (
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            type="button"
                            onClick={() => void playTargetAudio(currentExercise.audioText!, 'normal')}
                            className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500"
                          >
                            <Volume2 className="h-4 w-4" />
                            <span>{speakingText === currentExercise.audioText ? 'Playing' : 'Listen'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void playTargetAudio(currentExercise.audioText!, 'slow')}
                            className="flex min-h-[42px] items-center gap-1 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-[#1C1530] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-violet-400"
                          >
                            <span>0.65x Slow</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Exercise Kind 1 & 2: Multiple Choice / Listening */}
                {(currentExercise.kind === 'multiple_choice' || currentExercise.kind === 'listening') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(currentExercise.options || []).map((opt) => {
                      const picked = selectedOption === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={Boolean(exChecked)}
                          onClick={() => setSelectedOption(opt)}
                          className={`min-h-[52px] rounded-2xl border p-4 text-left text-sm font-semibold transition-all ${
                            picked
                              ? 'border-violet-500 bg-violet-600/15 text-violet-900 dark:text-white'
                              : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#130E22] text-slate-800 dark:text-slate-200 hover:border-violet-400/50'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Exercise Kind 3: Sentence Builder */}
                {currentExercise.kind === 'sentence_builder' && (
                  <div className="space-y-4">
                    <div className="min-h-[68px] rounded-2xl border border-dashed border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-[#110C1F] p-3 flex flex-wrap gap-2 items-center">
                      {builtTokens.length === 0 ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Tap word tiles below in the right order...
                        </span>
                      ) : (
                        builtTokens.map((idx, pos) => (
                          <button
                            key={`${idx}-${pos}`}
                            type="button"
                            disabled={Boolean(exChecked)}
                            onClick={() =>
                              setBuiltTokens((prev) => prev.filter((_, pIndex) => pIndex !== pos))
                            }
                            className="min-h-[40px] rounded-xl bg-violet-600 px-3.5 py-1.5 text-sm font-semibold text-white"
                          >
                            {currentExercise.wordBank?.[idx]}
                          </button>
                        ))
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(currentExercise.wordBank || []).map((token, idx) => {
                        const used = builtTokens.includes(idx);
                        return (
                          <button
                            key={`${token}-${idx}`}
                            type="button"
                            disabled={used || Boolean(exChecked)}
                            onClick={() => setBuiltTokens((prev) => [...prev, idx])}
                            className={`min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
                              used
                                ? 'border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/5 text-slate-400 opacity-40'
                                : 'border-slate-300 dark:border-white/15 bg-white dark:bg-[#17112A] text-slate-900 dark:text-white hover:border-violet-500'
                            }`}
                          >
                            {token}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Exercise Kind 4: Script / Kana / Kanji Match */}
                {currentExercise.kind === 'script_match' && currentExercise.matchPairs && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2.5">
                      {currentExercise.matchPairs.map((pair) => {
                        const matched = matchedPairIds.includes(pair.id);
                        const active = leftPickId === pair.id;
                        return (
                          <button
                            key={`l-${pair.id}`}
                            type="button"
                            disabled={matched || Boolean(exChecked)}
                            onClick={() => setLeftPickId(pair.id)}
                            className={`flex min-h-[48px] w-full items-center justify-center rounded-xl border text-lg font-bold transition-colors ${
                              matched
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                : active
                                  ? 'border-violet-500 bg-violet-600 text-white'
                                  : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#151025] text-slate-900 dark:text-white hover:border-violet-400'
                            }`}
                          >
                            {pair.left}
                          </button>
                        );
                      })}
                    </div>
                    <div className="space-y-2.5">
                      {shuffledRightPairs.map((pair) => {
                        const matched = matchedPairIds.includes(pair.id);
                        return (
                          <button
                            key={`r-${pair.id}`}
                            type="button"
                            disabled={matched || Boolean(exChecked)}
                            onClick={() => handleMatchRightPick(pair.id)}
                            className={`flex min-h-[48px] w-full items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                              matched
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                : wrongMatchFlash
                                  ? 'border-rose-500 bg-rose-500/15 text-rose-600'
                                  : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#151025] text-slate-900 dark:text-white hover:border-violet-400'
                            }`}
                          >
                            {pair.right}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Exercise Kind 5: Typing Translate */}
                {currentExercise.kind === 'typing_translate' && (
                  <input
                    type="text"
                    value={typedAnswer}
                    disabled={Boolean(exChecked)}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder={`Type your answer in ${nativeMeta.name}...`}
                    className="w-full min-h-[48px] rounded-2xl border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#140F24] px-4 py-3 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  />
                )}

                {/* Exercise Kind 6: Speaking */}
                {currentExercise.kind === 'speaking' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {!recording ? (
                        <button
                          type="button"
                          disabled={evalLoading || Boolean(exChecked)}
                          onClick={() =>
                            void startRecordingForPhrase(
                              currentExercise.audioText ||
                                currentExercise.promptTarget ||
                                currentExercise.correctAnswer
                            )
                          }
                          className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                        >
                          <Mic className="h-4 w-4" />
                          <span>Tap to Speak</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
                        >
                          <Square className="h-4 w-4" />
                          <span>Stop & Evaluate</span>
                        </button>
                      )}
                      {evalLoading && (
                        <span className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-300">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyzing pronunciation...
                        </span>
                      )}
                    </div>

                    {speakingEvalResult && (
                      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] p-4 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white tabular-nums">
                          <span>Heard: "{speakingEvalResult.transcript}"</span>
                          <span
                            className={
                              speakingEvalResult.passed
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            Score: {speakingEvalResult.score}/100
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">{speakingEvalResult.feedbackNative}</p>
                        {speakingEvalResult.tipTarget && (
                          <p className="text-violet-700 dark:text-violet-300 font-medium">
                            Coach Tip: {speakingEvalResult.tipTarget}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={typedAnswer}
                        disabled={Boolean(exChecked)}
                        onChange={(e) => setTypedAnswer(e.target.value)}
                        placeholder="Or type the phrase / romanization if mic unavailable..."
                        className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#140F24] px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Feedback Banner + AI Teacher "Why?" */}
                {exChecked && (
                  <div
                    className={`rounded-2xl border p-4 space-y-2 ${
                      exChecked.correct
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                        : 'border-rose-500/35 bg-rose-500/10 text-rose-900 dark:text-rose-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-bold">
                        {exChecked.correct ? (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <X className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        )}
                        {exChecked.correct ? 'Excellent!' : 'Let’s review that'}
                      </span>
                      <button
                        type="button"
                        disabled={aiExplainLoading}
                        onClick={() => void handleExplainExercise()}
                        className="flex items-center gap-1.5 rounded-lg border border-current/25 px-2.5 py-1 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {aiExplainLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <HelpCircle className="h-3.5 w-3.5" />
                        )}
                        <span>Ask AI Teacher Why</span>
                      </button>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">{exChecked.message}</p>
                    {aiExplainText && (
                      <div className="mt-2 rounded-xl bg-white/80 dark:bg-[#0D0917]/80 p-3 text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line">
                        {aiExplainText}
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom Action Footer */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
                  {!exChecked ? (
                    <button
                      type="button"
                      onClick={checkCurrentExercise}
                      className="min-h-[46px] rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
                    >
                      Check Answer
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={advanceLesson}
                      className="flex min-h-[46px] items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      <span>
                        {exIndex + 1 < activeLesson.exercises.length ? 'Next Exercise' : 'Finish Lesson'}
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </section>
            ) : (
              /* ---------------- STRUCTURED UNITS -> CHAPTERS -> LESSONS PATH ---------------- */
              <div className="space-y-5">
                {allUnits.map((unit) => {
                  const unitUnlocked = activeProfile.unlockedUnitNumbers.includes(unit.unitNumber);
                  const unitLessons = unit.chapters.flatMap((c) => c.lessons);
                  const doneInUnit = unitLessons.filter((l) =>
                    activeProfile.completedLessonIds.includes(l.id)
                  ).length;

                  return (
                    <section
                      key={unit.id}
                      className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-5 sm:p-6 shadow-sm space-y-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
                            <span>UNIT {unit.unitNumber}</span>
                            <span>·</span>
                            <span>{unit.cefrOrLevel}</span>
                            <span>·</span>
                            <span className="tabular-nums">
                              {doneInUnit}/{unitLessons.length} completed
                            </span>
                          </div>
                          <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
                            {unit.title}
                          </h2>
                          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                            {unit.description}
                          </p>
                        </div>
                        {!unitUnlocked && (
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveProfile((p) => ({
                                ...p,
                                unlockedUnitNumbers: Array.from(
                                  new Set([...p.unlockedUnitNumbers, unit.unitNumber])
                                ),
                              }))
                            }
                            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-violet-400/40 bg-violet-500/10 px-3.5 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-200 hover:bg-violet-500/20"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            <span>Unlock Unit Early</span>
                          </button>
                        )}
                      </div>

                      <div className="space-y-4">
                        {unit.chapters.map((chapter) => (
                          <div
                            key={chapter.id}
                            className="rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50/70 dark:bg-[#120D20] p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-xs font-bold text-slate-900 dark:text-white">
                                  {chapter.title}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Focus: {chapter.focusSkill} · {chapter.description}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {chapter.lessons.map((lesson) => {
                                const flatIdx = unitLessons.findIndex((l) => l.id === lesson.id);
                                const unlocked = isLessonUnlocked(
                                  unit.unitNumber,
                                  flatIdx,
                                  unitLessons
                                );
                                const completed = activeProfile.completedLessonIds.includes(
                                  lesson.id
                                );
                                return (
                                  <button
                                    key={lesson.id}
                                    type="button"
                                    disabled={!unlocked}
                                    onClick={() => startLesson(lesson)}
                                    className={`flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                                      completed
                                        ? 'border-emerald-500/35 bg-emerald-500/10'
                                        : unlocked
                                          ? 'border-slate-200 dark:border-white/12 bg-white dark:bg-[#19122B] hover:border-violet-500'
                                          : 'border-slate-200 dark:border-white/5 bg-slate-100/80 dark:bg-[#0B0814] opacity-60 cursor-not-allowed'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                                        <span>{lesson.skill}</span>
                                        <span>·</span>
                                        <span className="tabular-nums">+{lesson.xpReward} XP</span>
                                        <span>·</span>
                                        <span className="tabular-nums">{lesson.estimatedMinutes}m</span>
                                      </div>
                                      <div className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white truncate">
                                        {lesson.title}
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                        {lesson.subtitle}
                                      </div>
                                    </div>
                                    <div className="shrink-0">
                                      {completed ? (
                                        <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                      ) : unlocked ? (
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white">
                                          <Play className="h-4 w-4" />
                                        </span>
                                      ) : (
                                        <Lock className="h-5 w-5 text-slate-400" />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Deck: AI Unit Generator, Mistake Revision, Japanese Track Summary */}
          <aside className="lg:col-span-4 space-y-4">
            <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <span>AI Curriculum Builder</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Generate a personalized {targetMeta.name} unit for your {activeProfile.level} level in {nativeMeta.name}.
              </p>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Optional topic (e.g., Travel, Business, Anime, Tech)"
                className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#140F24] px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={generatingUnit}
                onClick={() => void handleGenerateAiUnit()}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
              >
                {generatingUnit ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Building AI Unit...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Generate Next AI Unit</span>
                  </>
                )}
              </button>
            </section>

            <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <RefreshCw className="h-4 w-4 text-emerald-500" />
                  <span>Smart Revision Session</span>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  {activeProfile.mistakeExerciseIds.length} queued
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Run an AI spaced-repetition revision session targeting tricky words, listening, and grammar.
              </p>
              <button
                type="button"
                disabled={generatingRevision}
                onClick={() => void handleGenerateRevisionLesson()}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60"
              >
                {generatingRevision ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Preparing Revision...</span>
                  </>
                ) : (
                  <>
                    <BookOpen className="h-4 w-4" />
                    <span>Start AI Revision Drill</span>
                  </>
                )}
              </button>
            </section>

            {targetCode === 'ja' && (
              <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-5 space-y-2.5 shadow-sm">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Japanese Mastery Tracks
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    'Hiragana (46)',
                    'Katakana (46)',
                    'Kanji Readings',
                    'Vocabulary',
                    'Grammar & は/を',
                    'Sentence Order',
                    'Listening (0.65x)',
                    'Speaking Coach',
                  ].map((track) => (
                    <button
                      key={track}
                      type="button"
                      onClick={() => {
                        if (track.startsWith('Hiragana')) {
                          setJaScriptTab('Hiragana');
                          setSubTab('scripts');
                        } else if (track.startsWith('Katakana')) {
                          setJaScriptTab('Katakana');
                          setSubTab('scripts');
                        } else if (track.startsWith('Kanji')) {
                          setJaScriptTab('Kanji');
                          setSubTab('scripts');
                        } else if (track.startsWith('Speaking') || track.startsWith('Listening')) {
                          setSubTab('speaking_lab');
                        } else {
                          setSubTab('scripts');
                          setJaScriptTab('Vocab');
                        }
                      }}
                      className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] px-2.5 py-2 text-left font-medium text-slate-700 dark:text-slate-300 hover:border-violet-400"
                    >
                      {track}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: AI TEACHER & CONVERSATIONAL ROLEPLAY CHAT                      */}
      {/* ===================================================================== */}
      {subTab === 'tutor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-8 flex flex-col rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] overflow-hidden shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 px-5 py-3.5 bg-slate-50 dark:bg-[#120D20]">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Nova AI Language Teacher · {targetMeta.name}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Adapts to {activeProfile.level} · Explains mistakes in {nativeMeta.name}
                </p>
              </div>
              <select
                aria-label="Select roleplay scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-[#19132B] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                {ROLEPLAY_SCENARIOS.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </div>

            <div className="h-[430px] overflow-y-auto p-5 space-y-4">
              {(activeProfile.tutorHistory || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/15 p-6 text-center space-y-2">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    Start practicing {targetMeta.name} with your AI Teacher
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Write in {targetMeta.name}, romanization, or {nativeMeta.name}. Your teacher replies naturally, includes pronunciation, translates to {nativeMeta.name}, and corrects your grammar gently.
                  </p>
                  <div className="pt-2 flex flex-wrap justify-center gap-2">
                    {[
                      `Teach me how to introduce myself in ${targetMeta.name}`,
                      `Let's practice ordering at a cafe in ${targetMeta.name}`,
                      targetMeta.greetingSample,
                    ].map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => void handleSendTutorMessage(starter)}
                        className="rounded-xl border border-violet-400/35 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-200 hover:bg-violet-500/20"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                activeProfile.tutorHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 space-y-2 ${
                        msg.role === 'user'
                          ? 'bg-violet-600 text-white'
                          : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold">{msg.textTarget}</div>
                        {msg.role === 'assistant' && (
                          <button
                            type="button"
                            onClick={() => void playTargetAudio(msg.textTarget)}
                            aria-label="Listen to teacher response"
                            className="shrink-0 rounded-lg p-1.5 text-violet-600 dark:text-violet-300 hover:bg-violet-500/15"
                          >
                            <Volume2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {state.showRomanization && msg.phonetics && (
                        <div className="text-xs font-mono text-violet-700 dark:text-violet-300">
                          {msg.phonetics}
                        </div>
                      )}
                      {msg.translationNative && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-white/10 pt-1.5">
                          {msg.translationNative}
                        </div>
                      )}
                      {msg.correction && (
                        <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                          Feedback: {msg.correction}
                        </div>
                      )}
                      {msg.grammarNotes && msg.grammarNotes.length > 0 && (
                        <ul className="list-disc pl-4 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                          {msg.grammarNotes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendTutorMessage();
              }}
              className="flex items-center gap-2 border-t border-slate-200 dark:border-white/10 p-3.5 bg-slate-50/70 dark:bg-[#110C1E]"
            >
              <input
                type="text"
                value={tutorInput}
                onChange={(e) => setTutorInput(e.target.value)}
                placeholder={`Reply in ${targetMeta.name} or ask your AI Teacher in ${nativeMeta.name}...`}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-[#19132B] px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={tutorSending || !tutorInput.trim()}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {tutorSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Send</span>
              </button>
            </form>
          </section>

          <aside className="lg:col-span-4 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-5 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Quick Roleplay Prompts</h3>
            <div className="space-y-2">
              {[
                `Explain how politeness works in ${targetMeta.name}.`,
                `Quiz me on 3 everyday phrases at ${activeProfile.level} level.`,
                `Give me a short dialogue using sentence connectors.`,
                `Correct this sentence and explain my grammar clearly.`,
              ].map((pText) => (
                <button
                  key={pText}
                  type="button"
                  onClick={() => void handleSendTutorMessage(pText)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] p-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-violet-500"
                >
                  {pText}
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: JAPANESE HIRAGANA/KATAKANA/KANJI & VOCAB SRS FLASHCARDS        */}
      {/* ===================================================================== */}
      {subTab === 'scripts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-8 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-5 sm:p-6 shadow-sm space-y-5">
            {targetCode === 'ja' && (
              <div className="flex flex-wrap gap-2">
                {(['Hiragana', 'Katakana', 'Kanji', 'Vocab'] as JapaneseScriptTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setJaScriptTab(tab);
                      setSelectedKana(null);
                    }}
                    className={`min-h-[40px] rounded-xl px-4 py-1.5 text-xs font-semibold transition-colors ${
                      jaScriptTab === tab
                        ? 'bg-violet-600 text-white'
                        : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            {/* Japanese Script Grids or Other Language Script Charts */}
            {(targetCode === 'ja' && jaScriptTab !== 'Vocab') ||
            (targetCode !== 'ja' && (OTHER_LANGUAGE_SCRIPTS[targetCode]?.length ?? 0) > 0) ? (
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">
                  {targetCode === 'ja'
                    ? `Interactive ${jaScriptTab} Lab — tap any character to hear & inspect strokes`
                    : `${targetMeta.name} Script Guide`}
                </h2>
                <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {(targetCode === 'ja'
                    ? jaScriptTab === 'Hiragana'
                      ? JAPANESE_HIRAGANA
                      : jaScriptTab === 'Katakana'
                        ? JAPANESE_KATAKANA
                        : JAPANESE_KANJI
                    : OTHER_LANGUAGE_SCRIPTS[targetCode] || []
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedKana(item);
                        void playTargetAudio(item.category === 'Kanji' ? item.exampleWord : item.char);
                      }}
                      className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl border p-2 transition-colors ${
                        selectedKana?.id === item.id
                          ? 'border-violet-500 bg-violet-600/15'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] hover:border-violet-400'
                      }`}
                    >
                      <span className="text-xl font-bold text-slate-900 dark:text-white">{item.char}</span>
                      <span className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {item.reading}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Vocabulary Flashcards Deck */}
            {(targetCode !== 'ja' || jaScriptTab === 'Vocab') && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {targetMeta.name} Vocabulary Bank & Spaced Repetition
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {activeProfile.vocabBank.length} cards
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeProfile.vocabBank.map((card) => (
                    <div
                      key={card.id}
                      className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] p-4 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-lg font-bold text-slate-900 dark:text-white">
                            {card.term}
                          </div>
                          {state.showRomanization && card.reading && (
                            <div className="text-xs font-mono text-violet-700 dark:text-violet-300">
                              {card.reading}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void playTargetAudio(card.term)}
                          aria-label={`Pronounce ${card.term}`}
                          className="rounded-lg p-2 text-violet-600 dark:text-violet-300 hover:bg-violet-500/15"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {card.meaning}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Example: {card.example}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                          Mastery: {card.mastery}%
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateVocabMastery(card.id, -15)}
                            className="rounded-lg border border-amber-500/35 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                          >
                            Review Again
                          </button>
                          <button
                            type="button"
                            onClick={() => updateVocabMastery(card.id, 20)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                          >
                            Know It
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="lg:col-span-4 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-5 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Character Inspector</h3>
            {selectedKana ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-violet-500/25 bg-violet-500/10 p-4">
                  <div>
                    <div className="text-4xl font-bold text-slate-900 dark:text-white">
                      {selectedKana.char}
                    </div>
                    <div className="mt-1 text-sm font-mono font-semibold text-violet-700 dark:text-violet-300">
                      {selectedKana.reading}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void playTargetAudio(selectedKana.exampleWord)}
                    className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white"
                  >
                    <Volume2 className="h-4 w-4" />
                    <span>Hear Word</span>
                  </button>
                </div>
                {selectedKana.meaning && (
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    Meaning: <strong>{selectedKana.meaning}</strong>
                  </div>
                )}
                {selectedKana.onyomi && (
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    On’yomi: {selectedKana.onyomi} · Kun’yomi: {selectedKana.kunyomi}
                  </div>
                )}
                {selectedKana.strokeCount && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    Strokes: {selectedKana.strokeCount}
                  </div>
                )}
                <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] p-3 text-xs space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Example: {selectedKana.exampleWord}
                  </div>
                  <div className="font-mono text-slate-500 dark:text-slate-400">
                    {selectedKana.exampleReading}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    “{selectedKana.exampleMeaning}”
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select any character from the grid to hear pronunciation, inspect stroke counts, readings, and real usage examples.
              </p>
            )}
          </aside>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: LISTENING & SPEAKING PRONUNCIATION STUDIO                      */}
      {/* ===================================================================== */}
      {subTab === 'speaking_lab' && (
        <section className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-6 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {targetMeta.name} Listening & Speaking Coach
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Listen at normal or 0.65x slow speed, record your voice, and get instant AI phonetic scoring.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStudioPhraseIndex((i) => i + 1);
                setSpeakingEvalResult(null);
              }}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 dark:border-white/15 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-violet-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Next Practice Phrase</span>
            </button>
          </div>

          <div className="rounded-2xl border border-violet-500/20 bg-slate-50 dark:bg-[#140F24] p-5 space-y-3">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {activeStudioDrill.meaning}
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {activeStudioDrill.target}
            </div>
            {state.showRomanization && activeStudioDrill.romanization && (
              <div className="text-sm font-mono text-violet-700 dark:text-violet-300">
                {activeStudioDrill.romanization}
              </div>
            )}
            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void playTargetAudio(activeStudioDrill.target, 'normal')}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500"
              >
                <Volume2 className="h-4 w-4" />
                <span>Play Normal (1.0x)</span>
              </button>
              <button
                type="button"
                onClick={() => void playTargetAudio(activeStudioDrill.target, 'slow')}
                className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-[#1C1530] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <Volume2 className="h-4 w-4" />
                <span>Play Slow (0.65x)</span>
              </button>
              {!recording ? (
                <button
                  type="button"
                  disabled={evalLoading}
                  onClick={() => void startRecordingForPhrase(activeStudioDrill.target)}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Mic className="h-4 w-4" />
                  <span>Record & Score</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white"
                >
                  <Square className="h-4 w-4" />
                  <span>Stop Recording</span>
                </button>
              )}
            </div>
          </div>

          {speakingEvalResult && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1.5 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white tabular-nums">
                <span>Recognized: {speakingEvalResult.transcript}</span>
                <span>Pronunciation Score: {speakingEvalResult.score}/100</span>
              </div>
              <p className="text-slate-700 dark:text-slate-200">{speakingEvalResult.feedbackNative}</p>
              <p className="font-medium text-violet-700 dark:text-violet-300">
                Phonetic Tip: {speakingEvalResult.tipTarget}
              </p>
            </div>
          )}
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: MULTI-LANGUAGE SWITCHER, LEVEL & PREFERENCES SETTINGS          */}
      {/* ===================================================================== */}
      {subTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-6 space-y-5 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Languages & Active Courses ({activeLanguagesCount} active)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Learn multiple languages simultaneously. Progress, XP, vocabulary, and levels stay completely separate for each language.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  I speak (Native Language)
                </label>
                <select
                  value={nativeCode}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      nativeLanguage: e.target.value as SupportedLanguageCode,
                    }))
                  }
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#140F24] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {targetMeta.name} Proficiency Level
                </label>
                <select
                  value={activeProfile.level}
                  onChange={(e) => handleSelectLevel(e.target.value as ProficiencyLevel)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#140F24] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  {PROFICIENCY_LEVELS.map((lv) => (
                    <option key={lv.level} value={lv.level}>
                      {lv.level} ({lv.badge})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Choose Target Language to Learn or Switch
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const prof = state.profiles[lang.code];
                  const isCurrent = lang.code === targetCode;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleSelectTargetLanguage(lang.code)}
                      className={`flex min-h-[60px] items-center justify-between gap-2 rounded-2xl border p-3 text-left transition-colors ${
                        isCurrent
                          ? 'border-violet-500 bg-violet-600/15'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#140F24] hover:border-violet-400'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {lang.name} · {lang.nativeName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {prof
                            ? `${prof.level} · ${prof.xp} XP · ${prof.completedLessonIds.length} lessons`
                            : `Not started · ${lang.accentLabel}`}
                        </div>
                      </div>
                      <Globe className="h-4 w-4 text-violet-500 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="lg:col-span-5 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0D0917] p-6 space-y-4 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Study Preferences</h3>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3 text-xs font-medium text-slate-800 dark:text-slate-200">
              <span>Show Romanization / Romaji / Pinyin</span>
              <input
                type="checkbox"
                checked={state.showRomanization}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, showRomanization: e.target.checked }))
                }
                className="h-4 w-4 accent-violet-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3 text-xs font-medium text-slate-800 dark:text-slate-200">
              <span>Auto-play pronunciation audio</span>
              <input
                type="checkbox"
                checked={state.autoPlayAudio}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, autoPlayAudio: e.target.checked }))
                }
                className="h-4 w-4 accent-violet-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3 text-xs font-medium text-slate-800 dark:text-slate-200">
              <span>Practice Mode (Unlimited Hearts)</span>
              <input
                type="checkbox"
                checked={activeProfile.practiceUnlimitedHearts}
                onChange={(e) =>
                  updateActiveProfile((p) => ({
                    ...p,
                    practiceUnlimitedHearts: e.target.checked,
                  }))
                }
                className="h-4 w-4 accent-violet-600"
              />
            </label>

            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                <span>Daily XP Goal</span>
                <span>{activeProfile.dailyGoalXp} XP</span>
              </div>
              <input
                type="range"
                min={20}
                max={150}
                step={10}
                value={activeProfile.dailyGoalXp}
                onChange={(e) =>
                  updateActiveProfile((p) => ({
                    ...p,
                    dailyGoalXp: Number(e.target.value),
                  }))
                }
                className="w-full accent-violet-600"
              />
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10">
              {!resetConfirmOpen ? (
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(true)}
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-700 dark:text-rose-200 hover:bg-rose-500/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset {targetMeta.name} Progress</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateActiveProfile(() =>
                        createDefaultLanguageProfile(targetCode, nativeCode)
                      );
                      setResetConfirmOpen(false);
                    }}
                    className="flex-1 min-h-[40px] rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetConfirmOpen(false)}
                    className="flex-1 min-h-[40px] rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
