import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  Bluetooth,
  BookOpen,
  Bot,
  Brain,
  CalendarClock,
  Check,
  Code2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  EyeOff,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  Flashlight,
  FolderKanban,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  Lock,
  Menu,
  Mic,
  Monitor,
  Moon,
  PanelLeft,
  Paperclip,
  Pencil,
  RotateCcw,
  ScanSearch,
  Search,
  Send,
  Server,
  Shield,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Unlock,
  Volume2,
  VolumeX,
  Wand2,
  Wifi,
  X,
} from 'lucide-react';
import { AgentRunnerPanel } from './components/AgentRunnerPanel';
import { ControlsPanel } from './components/ControlsPanel';
import { ConversationSidebar } from './components/ConversationSidebar';
import { CodeAgentModule } from './components/ecosystem/CodeAgentModule';
import { ComputerUseModule } from './components/ecosystem/ComputerUseModule';
import { ConnectModule } from './components/ecosystem/ConnectModule';
import { ControlGovernanceModule } from './components/ecosystem/ControlGovernanceModule';
import { FileWorkspaceModule } from './components/ecosystem/FileWorkspaceModule';
import { LearnLanguagesModule } from './components/ecosystem/LearnLanguagesModule';
import { MemoryModule } from './components/ecosystem/MemoryModule';
import { MultiAgentModule } from './components/ecosystem/MultiAgentModule';
import { ProjectsModule } from './components/ecosystem/ProjectsModule';
import { ResearchModule } from './components/ecosystem/ResearchModule';
import { SchedulerModule } from './components/ecosystem/SchedulerModule';
import { SkillsModule } from './components/ecosystem/SkillsModule';
import { FingerprintModal } from './components/FingerprintModal';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { NovaCoreOrb, NovaMiniPlanetLoader } from './components/NovaCoreOrb';
import { OwnerLockScreen } from './components/OwnerLockScreen';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallBanner';
import { SearchPanel } from './components/SearchPanel';
import { SecurityShieldPanel } from './components/SecurityShieldPanel';
import { ImageStudioModule, type StagedPdfImagePayload } from './components/studio/ImageStudioModule';
import { PdfStudioModule } from './components/studio/PdfStudioModule';
import { StudioPanel } from './components/StudioPanel';
import { WorkspaceHubModal, WorkspaceHubTab } from './components/WorkspaceHubModal';
import { BUILTIN_NOVA_SKILLS, detectRelevantSkills } from './data/builtinSkills';
import {
  INITIAL_DEVICE_CONTROLS,
  INITIAL_MOBILE_INDEX,
  INITIAL_SECURITY_AUDIT,
  INITIAL_TASKS,
} from './data/initialMobileData';
import { useBiometrics } from './hooks/useBiometrics';
import { useBackgroundSync } from './hooks/useBackgroundSync';
import { useOnlineStatus } from './hooks/usePWAInstall';
import type {
  AdaptedCommandCode,
  AgentRunPlan,
  AgentStep,
  AlarmItem,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  DeviceControlsState,
  GeneratedImageRecord,
  GeneratedPdfRecord,
  IntelligenceMode,
  MemoryItem,
  MobileIndexItem,
  MultiAgentRunResult,
  NavTab,
  NovaAIMode,
  NovaOrbState,
  NovaProject,
  NovaSkill,
  NovaToolAction,
  PersonalisationSettings,
  PreferredModelId,
  PrivacySettings,
  QuickCommandKey,
  ResearchReport,
  SchedulerNotifItem,
  SecurityAppAudit,
  StudioArtifact,
  TaskItem,
  WorkspaceFileRecord,
} from './types/nova';
import { startAlarmChime, stopAlarmChime } from './utils/alarmAudio';
import { processOfflineRequest, tryInstantLocalCommand } from './utils/offlineBrain';
import { createFormattedPdf, downloadBase64Pdf, uint8ToBase64 } from './utils/pdfEngine';
import {
  createOfflineProceduralSvg,
  generateLocalCommandPasskey,
  svgToPngDataUrl,
} from './utils/vectorArt';

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const STORAGE_KEYS = {
  tasks: 'nova_tasks_v1',
  device: 'nova_device_v1',
  index: 'nova_mobile_index_v1',
  security: 'nova_security_audit_v1',
  messages: 'nova_messages_v1',
  sessions: 'nova_sessions_v1',
  activeSessionId: 'nova_active_session_v1',
  memories: 'nova_memories_v1',
  personalisation: 'nova_personalisation_v1',
  preferredModel: 'nova_model_v1',
  alarms: 'nova_alarms_v1',
  codes: 'nova_adapted_codes_v1',
  commandKeys: 'nova_command_keys_v1',
  images: 'nova_saved_images_v1',
  pdfs: 'nova_saved_pdfs_v1',
  privacy: 'nova_privacy_v1',
  projects: 'nova_projects_v1',
  activeProjectId: 'nova_active_project_v1',
  artifacts: 'nova_artifacts_v1',
  skills: 'nova_skills_v1',
  researchReports: 'nova_research_reports_v1',
  workspaceFiles: 'nova_workspace_files_v1',
  multiAgentHistory: 'nova_multi_agent_v1',
};

const NOVA_AI_MODE_OPTIONS: Array<{ id: NovaAIMode; label: string }> = [
  { id: 'normal', label: 'Normal Mode' },
  { id: 'study', label: 'Study Mode' },
  { id: 'developer', label: 'Developer Mode' },
  { id: 'research', label: 'Research Mode' },
  { id: 'creative', label: 'Creative Mode' },
  { id: 'expert', label: 'Expert Mode' },
  { id: 'problem_solver', label: 'Problem Solver Mode' },
];

const INITIAL_PERSONALISATION: PersonalisationSettings = {
  customInstructions: '',
  responseStyle: 'balanced',
  language: 'auto',
  responseLength: 'medium',
  theme: 'dark',
  speechRate: 1.0,
};

function createWelcomeMessage(): ChatMessage {
  return {
    id: `welcome-${Date.now()}`,
    role: 'assistant',
    text: 'Hey, I’m **Nova** — your intelligent AI assistant. Switch AI modes, attach PDFs/images/videos/code, launch multi-step autonomous tasks in Agent View, manage long-term memories, or work offline on your device.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

function createNewChatSession(title = 'New Conversation', mode: NovaAIMode = 'normal'): ChatSession {
  const nowMs = Date.now();
  return {
    id: `session-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    mode,
    updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    updatedAtMs: nowMs,
    messages: [createWelcomeMessage()],
  };
}

const MEDIA_TRACKS = [
  { title: 'Midnight Orbit (Ambient Mix)', artist: 'Nova Radio' },
  { title: 'Violet Horizon Lo-Fi', artist: 'Deep Space Beats' },
  { title: 'Rain on Obsidian Glass', artist: 'Focus Stream' },
];

const INITIAL_ALARMS: AlarmItem[] = [
  {
    id: 'alarm-1',
    time24: '07:00',
    label: 'Morning Briefing Alarm',
    enabled: false,
    repeatDays: ['Daily'],
  },
];

const INITIAL_ADAPTED_CODES: AdaptedCommandCode[] = [
  {
    id: 'code-1',
    code: '#focus',
    description: 'Enable Do Not Disturb and dim brightness to 45%',
    actions: [
      { setting: 'dnd', booleanValue: true },
      { setting: 'brightness', numericValue: 45 },
    ],
    createdAt: 'Default',
  },
];

const INITIAL_COMMAND_KEYS: QuickCommandKey[] = [
  {
    id: 'qkey-1',
    passkey: 'nk_focus_91a4',
    label: 'Instant Focus Lockdown',
    commandPrompt: 'turn on dnd and set brightness 45',
    operationType: 'macro',
    createdAt: 'Default',
  },
  {
    id: 'qkey-2',
    passkey: 'nk_brief_72c8',
    label: 'Quick Daily Focus PDF',
    commandPrompt: 'Daily productivity and phone privacy security checklist',
    operationType: 'generate-pdf',
    createdAt: 'Default',
  },
];

const INITIAL_PRIVACY: PrivacySettings = {
  ownerLockEnabled: false,
  ownerPin: '1234',
  incognitoMode: false,
  strictOfflinePrivacy: false,
};

export default function App() {
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<NavTab>('assistant');
  const [orbState, setOrbState] = useState<NovaOrbState>('idle');
  const [reasoningMode, setReasoningMode] = useState<IntelligenceMode>('fast');

  const [privacy, setPrivacy] = useState<PrivacySettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.privacy);
      return saved ? { ...INITIAL_PRIVACY, ...JSON.parse(saved) } : INITIAL_PRIVACY;
    } catch {
      return INITIAL_PRIVACY;
    }
  });
  const [ownerGatePassed, setOwnerGatePassed] = useState<boolean>(() => !privacy.ownerLockEnabled);

  const [device, setDevice] = useState<DeviceControlsState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.device);
      return saved ? { ...INITIAL_DEVICE_CONTROLS, ...JSON.parse(saved) } : INITIAL_DEVICE_CONTROLS;
    } catch {
      return INITIAL_DEVICE_CONTROLS;
    }
  });

  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.tasks);
      return saved ? JSON.parse(saved) : INITIAL_TASKS;
    } catch {
      return INITIAL_TASKS;
    }
  });

  const [alarms, setAlarms] = useState<AlarmItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.alarms);
      return saved ? JSON.parse(saved) : INITIAL_ALARMS;
    } catch {
      return INITIAL_ALARMS;
    }
  });
  const [ringingAlarm, setRingingAlarm] = useState<AlarmItem | null>(null);

  const [adaptedCodes, setAdaptedCodes] = useState<AdaptedCommandCode[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.codes);
      return saved ? JSON.parse(saved) : INITIAL_ADAPTED_CODES;
    } catch {
      return INITIAL_ADAPTED_CODES;
    }
  });

  const [commandKeys, setCommandKeys] = useState<QuickCommandKey[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.commandKeys);
      return saved ? JSON.parse(saved) : INITIAL_COMMAND_KEYS;
    } catch {
      return INITIAL_COMMAND_KEYS;
    }
  });

  const [mobileIndex, setMobileIndex] = useState<MobileIndexItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.index);
      return saved ? JSON.parse(saved) : INITIAL_MOBILE_INDEX;
    } catch {
      return INITIAL_MOBILE_INDEX;
    }
  });

  const [securityAudits, setSecurityAudits] = useState<SecurityAppAudit[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.security);
      return saved ? JSON.parse(saved) : INITIAL_SECURITY_AUDIT;
    } catch {
      return INITIAL_SECURITY_AUDIT;
    }
  });

  const [savedImages, setSavedImages] = useState<GeneratedImageRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.images);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [savedPdfs, setSavedPdfs] = useState<GeneratedPdfRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.pdfs);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [stagedPdfMedia, setStagedPdfMedia] = useState<StagedPdfImagePayload | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const savedSessions = localStorage.getItem(STORAGE_KEYS.sessions);
      if (savedSessions) {
        const parsed = JSON.parse(savedSessions) as ChatSession[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const legacyMsgs = localStorage.getItem(STORAGE_KEYS.messages);
      if (legacyMsgs) {
        const parsedMsgs = JSON.parse(legacyMsgs) as ChatMessage[];
        if (Array.isArray(parsedMsgs) && parsedMsgs.length > 0) {
          return [
            {
              id: 'session-1',
              title: 'Main Conversation',
              mode: 'normal',
              updatedAt: 'Today',
              updatedAtMs: Date.now(),
              messages: parsedMsgs,
            },
          ];
        }
      }
    } catch {
      // ignore
    }
    return [createNewChatSession('Main Conversation', 'normal')];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.activeSessionId) || 'session-1';
    } catch {
      return 'session-1';
    }
  });

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions]
  );

  const messages = activeSession.messages;
  const aiMode = activeSession.mode;

  const updateSessionById = useCallback(
    (sessionId: string, updater: (prev: ChatSession) => ChatSession) => {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? updater(s) : s)));
    },
    []
  );

  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]), targetId?: string) => {
      const resolvedId = targetId ?? activeSession.id;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== resolvedId) return s;
          const nextMsgs = typeof updater === 'function' ? updater(s.messages) : updater;
          const firstUser = nextMsgs.find((m) => m.role === 'user')?.text;
          const autoTitle =
            s.title === 'New Conversation' && firstUser
              ? firstUser.slice(0, 42) + (firstUser.length > 42 ? '…' : '')
              : s.title;
          return {
            ...s,
            title: autoTitle,
            updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            updatedAtMs: Date.now(),
            messages: nextMsgs,
          };
        })
      );
    },
    [activeSession.id]
  );

  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.memories);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [pendingMemorySuggestions, setPendingMemorySuggestions] = useState<
    Array<{ id: string; content: string; category: MemoryItem['category'] }>
  >([]);

  const [personalisation, setPersonalisation] = useState<PersonalisationSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.personalisation);
      return saved ? { ...INITIAL_PERSONALISATION, ...JSON.parse(saved) } : INITIAL_PERSONALISATION;
    } catch {
      return INITIAL_PERSONALISATION;
    }
  });

  const [preferredModel, setPreferredModel] = useState<PreferredModelId>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEYS.preferredModel) as PreferredModelId) || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [projects, setProjects] = useState<NovaProject[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.projects);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.activeProjectId) || null;
    } catch {
      return null;
    }
  });

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );

  const [artifacts, setArtifacts] = useState<StudioArtifact[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.artifacts);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [skills, setSkills] = useState<NovaSkill[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.skills);
      if (saved) {
        const parsed = JSON.parse(saved) as NovaSkill[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return BUILTIN_NOVA_SKILLS;
  });

  const [researchReports, setResearchReports] = useState<ResearchReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.researchReports);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.workspaceFiles);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [multiAgentHistory, setMultiAgentHistory] = useState<MultiAgentRunResult[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.multiAgentHistory);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [schedulerNotifs, setSchedulerNotifs] = useState<SchedulerNotifItem[]>([]);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);
  const [mobileModulesOpen, setMobileModulesOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [workspaceHubOpen, setWorkspaceHubOpen] = useState(false);
  const [workspaceHubTab, setWorkspaceHubTab] = useState<WorkspaceHubTab>('memories');
  const [assistantView, setAssistantView] = useState<'chat' | 'agent'>('chat');
  const [agentPlan, setAgentPlan] = useState<AgentRunPlan | null>(null);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [slangMirroring, setSlangMirroring] = useState(true);
  const [proactiveMode, setProactiveMode] = useState(true);
  const [voiceReply, setVoiceReply] = useState(false);
  const [voiceName, setVoiceName] = useState<'Kore' | 'Zephyr' | 'Puck'>('Kore');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [proactiveBrief, setProactiveBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [bioReason, setBioReason] = useState(
    'Verify your fingerprint to unlock sensitive phone controls'
  );
  const pendingBioActionRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);

  const { biometrics, isUnlocked, enrollFingerprint, verifyFingerprint, lockNow } =
    useBiometrics();

  const {
    cloudUser,
    syncState,
    queueSyncMutation,
    reconcileNow,
    signInWithGoogle,
    signOutCloud,
  } = useBackgroundSync({
    isOnline,
    autoSync: device.autoSync,
    strictOfflinePrivacy: privacy.strictOfflinePrivacy,
    tasks,
    alarms,
    mobileIndex,
    onReconcileTasks: setTasks,
    onReconcileAlarms: setAlarms,
    onReconcileFiles: setMobileIndex,
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAttachRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const torchStreamRef = useRef<MediaStream | null>(null);

  const effectiveOffline = !isOnline || reasoningMode === 'offline' || privacy.strictOfflinePrivacy;

  // Apply Dark / Light theme cleanly on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', personalisation.theme === 'dark');
  }, [personalisation.theme]);

  // Persist private vault locally
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.device, JSON.stringify(device));
  }, [device]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.alarms, JSON.stringify(alarms));
  }, [alarms]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.codes, JSON.stringify(adaptedCodes));
  }, [adaptedCodes]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.commandKeys, JSON.stringify(commandKeys));
  }, [commandKeys]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.index, JSON.stringify(mobileIndex));
  }, [mobileIndex]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.security, JSON.stringify(securityAudits));
  }, [securityAudits]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.images, JSON.stringify(savedImages.slice(0, 12)));
    } catch {
      // quota guard for large base64 images
    }
  }, [savedImages]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.pdfs, JSON.stringify(savedPdfs.slice(0, 12)));
    } catch {
      // quota guard
    }
  }, [savedPdfs]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.privacy, JSON.stringify(privacy));
  }, [privacy]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.memories, JSON.stringify(memories));
  }, [memories]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.personalisation, JSON.stringify(personalisation));
  }, [personalisation]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.preferredModel, preferredModel);
  }, [preferredModel]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeSessionId, activeSession.id);
  }, [activeSession.id]);
  useEffect(() => {
    if (!privacy.incognitoMode) {
      try {
        const trimmedSessions = sessions.slice(0, 25).map((s) => ({
          ...s,
          messages: s.messages.slice(-40),
        }));
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(trimmedSessions));
      } catch {
        // quota guard
      }
    }
  }, [sessions, privacy.incognitoMode]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
    } catch {
      // quota guard
    }
  }, [projects]);
  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem(STORAGE_KEYS.activeProjectId, activeProjectId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeProjectId);
    }
  }, [activeProjectId]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.artifacts, JSON.stringify(artifacts.slice(0, 20)));
    } catch {
      // quota guard
    }
  }, [artifacts]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.skills, JSON.stringify(skills));
    } catch {
      // quota guard
    }
  }, [skills]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.researchReports, JSON.stringify(researchReports.slice(0, 15)));
    } catch {
      // quota guard
    }
  }, [researchReports]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.workspaceFiles, JSON.stringify(workspaceFiles.slice(0, 20)));
    } catch {
      // quota guard
    }
  }, [workspaceFiles]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.multiAgentHistory, JSON.stringify(multiAgentHistory.slice(0, 15)));
    } catch {
      // quota guard
    }
  }, [multiAgentHistory]);

  // Poll backend scheduler notifications every 30s so background alerts surface cleanly
  useEffect(() => {
    if (effectiveOffline) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/nova/scheduler/notifications');
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && Array.isArray(d.notifications)) {
          setSchedulerNotifs(d.notifications);
        }
      } catch {
        // ignore network poll errors
      }
    };
    void poll();
    const t = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [effectiveOffline]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, orbState, activeSession.id]);

  // Live ticking Alarm Scheduler (checks every 1s)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      const todayKey = now.toISOString().slice(0, 10);

      setAlarms((prev) => {
        let triggered: AlarmItem | null = null;
        const nowMs = Date.now();
        const next = prev.map((al) => {
          if (
            al.enabled &&
            al.time24 === hhmm &&
            al.lastTriggeredDate !== todayKey &&
            now.getSeconds() < 5
          ) {
            triggered = { ...al, lastTriggeredDate: todayKey, updatedAtMs: nowMs };
            return triggered;
          }
          return al;
        });

        if (triggered) {
          const firedAlarm: AlarmItem = triggered;
          setRingingAlarm(firedAlarm);
          startAlarmChime();
          queueSyncMutation('alarms', firedAlarm.id, 'upsert', nowMs, firedAlarm);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Nova Alarm', {
              body: `${firedAlarm.label} (${firedAlarm.time24})`,
              icon: '/pwa-192x192.png',
            });
          }
        }
        return triggered ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [queueSyncMutation]);

  // Real browser hardware telemetry (Battery + Network)
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (ev: string, fn: () => void) => void;
      }>;
      connection?: { effectiveType?: string };
    };

    if (nav.connection?.effectiveType) {
      setDevice((prev) => ({
        ...prev,
        networkType: nav.connection?.effectiveType?.toUpperCase() || prev.networkType,
      }));
    }

    if (typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((battery) => {
          const syncBattery = () => {
            setDevice((prev) => ({
              ...prev,
              batteryLevel: Math.round(battery.level * 100),
              batteryCharging: battery.charging,
            }));
          };
          syncBattery();
          battery.addEventListener('levelchange', syncBattery);
          battery.addEventListener('chargingchange', syncBattery);
        })
        .catch(() => {});
    }
  }, []);

  const requestBiometricFor = useCallback(
    (reason: string, actionAfterUnlock?: () => void) => {
      if (isUnlocked && actionAfterUnlock) {
        actionAfterUnlock();
        return;
      }
      pendingBioActionRef.current = actionAfterUnlock || null;
      setBioReason(reason);
      setBioModalOpen(true);
    },
    [isUnlocked]
  );

  const handleToggleSetting = useCallback(
    async (key: keyof DeviceControlsState, requiresBio?: boolean, explicitValue?: boolean) => {
      const executeToggle = async () => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15);
        }

        if (key === 'flashlight') {
          const nextState = explicitValue !== undefined ? explicitValue : !device.flashlight;
          if (nextState && navigator.mediaDevices?.getUserMedia) {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
              });
              const track = stream.getVideoTracks()[0];
              const capabilities = track.getCapabilities?.() as
                | (MediaTrackCapabilities & { torch?: boolean })
                | undefined;
              if (capabilities?.torch) {
                await track.applyConstraints({
                  advanced: [{ torch: true } as MediaTrackConstraintSet],
                });
                torchStreamRef.current = stream;
              } else {
                stream.getTracks().forEach((t) => t.stop());
              }
            } catch {
              // Torch unavailable
            }
          } else if (!nextState && torchStreamRef.current) {
            torchStreamRef.current.getTracks().forEach((t) => t.stop());
            torchStreamRef.current = null;
          }
        }

        setDevice((prev) => {
          const current = prev[key];
          if (typeof current !== 'boolean') return prev;
          const nextVal = explicitValue !== undefined ? explicitValue : !current;
          return { ...prev, [key]: nextVal };
        });
      };

      if (requiresBio && !isUnlocked) {
        requestBiometricFor(`Verify fingerprint to change ${String(key)}`, () => {
          void executeToggle();
        });
        return;
      }

      await executeToggle();
    },
    [device.flashlight, isUnlocked, requestBiometricFor]
  );

  const handleStartScan = useCallback(() => {
    setIsScanning(true);
    setOrbState('scanning');
    setTimeout(() => {
      setIsScanning(false);
      setOrbState('idle');
      setLastScanAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 2400);
  }, []);

  const handleQuarantineApp = useCallback(
    (id: string) => {
      const doQuarantine = () => {
        setSecurityAudits((prev) => prev.filter((item) => item.id !== id));
      };
      if (!isUnlocked) {
        requestBiometricFor('Verify fingerprint to quarantine suspicious package', doQuarantine);
        return;
      }
      doQuarantine();
    },
    [isUnlocked, requestBiometricFor]
  );

  const handleTrustApp = useCallback((id: string) => {
    setSecurityAudits((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'trusted', reason: undefined } : item
      )
    );
  }, []);

  const speakResponse = useCallback(
    async (text: string, forceVoice = false) => {
      if ((!voiceReply && !forceVoice) || !text.trim()) return;
      if (!effectiveOffline) {
        try {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
          setOrbState('speaking');
          const res = await fetch('/api/nova/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              voiceName,
              style: slangMirroring
                ? 'Warm, expressive, natural human companion'
                : 'Clear, helpful personal assistant',
            }),
          });
          const data = await res.json();
          if (res.ok && data.audioBase64) {
            const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
            audio.volume = Math.max(0.1, Math.min(1, device.volume / 100));
            audio.playbackRate = personalisation.speechRate || 1.0;
            audioRef.current = audio;
            audio.onended = () => setOrbState('idle');
            audio.onerror = () => setOrbState('idle');
            await audio.play();
            return;
          }
        } catch {
          // Fallback to Web Speech Synthesis
        }
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.volume = Math.max(0.1, Math.min(1, device.volume / 100));
          utter.rate = personalisation.speechRate || 1.0;
          utter.onend = () => setOrbState('idle');
          utter.onerror = () => setOrbState('idle');
          window.speechSynthesis.speak(utter);
          return;
        } catch {
          // ignore
        }
      }
      setOrbState('idle');
    },
    [
      device.volume,
      effectiveOffline,
      personalisation.speechRate,
      slangMirroring,
      voiceName,
      voiceReply,
    ]
  );

  const handleCopyText = useCallback((id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId((prev) => (prev === id ? null : prev)), 1600);
  }, []);

  const applyToolActions = useCallback(
    async (
      actions: NovaToolAction[],
      targetMessageId?: string,
      targetSessionId?: string
    ): Promise<{ generatedImageUrl?: string; generatedPdf?: GeneratedPdfRecord }> => {
      let generatedImageUrl: string | undefined;
      let generatedPdf: GeneratedPdfRecord | undefined;

      for (const act of actions) {
        if (act.type === 'controlDeviceSetting') {
          const setting = String(act.args.setting ?? '');
          if (act.requiresBiometric && !isUnlocked) {
            requestBiometricFor(`Nova needs your fingerprint to update ${setting}`, () => {
              if (
                [
                  'wifi',
                  'bluetooth',
                  'dnd',
                  'flashlight',
                  'batterySaver',
                  'airplaneMode',
                  'location',
                  'autoSync',
                ].includes(setting)
              ) {
                void handleToggleSetting(
                  setting as keyof DeviceControlsState,
                  false,
                  typeof act.args.booleanValue === 'boolean' ? act.args.booleanValue : undefined
                );
              }
            });
            continue;
          }

          if (
            [
              'wifi',
              'bluetooth',
              'dnd',
              'flashlight',
              'batterySaver',
              'airplaneMode',
              'location',
              'autoSync',
            ].includes(setting)
          ) {
            void handleToggleSetting(
              setting as keyof DeviceControlsState,
              false,
              typeof act.args.booleanValue === 'boolean' ? act.args.booleanValue : undefined
            );
          } else if (setting === 'brightness' && typeof act.args.numericValue === 'number') {
            setDevice((prev) => ({
              ...prev,
              brightness: Math.max(10, Math.min(100, act.args.numericValue as number)),
            }));
          } else if (setting === 'volume' && typeof act.args.numericValue === 'number') {
            setDevice((prev) => ({
              ...prev,
              volume: Math.max(0, Math.min(100, act.args.numericValue as number)),
            }));
          } else if (setting === 'mediaPlayPause') {
            setDevice((prev) => ({
              ...prev,
              activeMedia: { ...prev.activeMedia, playing: !prev.activeMedia.playing },
            }));
          } else if (setting === 'mediaNext') {
            setDevice((prev) => {
              const idx = MEDIA_TRACKS.findIndex((t) => t.title === prev.activeMedia.title);
              const next = MEDIA_TRACKS[(idx + 1) % MEDIA_TRACKS.length];
              return { ...prev, activeMedia: { ...next, playing: true } };
            });
          }
        } else if (act.type === 'setAlarm') {
          const action = String(act.args.action ?? 'set');
          const time24 = String(act.args.time ?? '07:00').slice(0, 5);
          const label = String(act.args.label ?? 'Nova Alarm');
          const nowMs = Date.now();
          if (action === 'cancel') {
            setAlarms((prev) => {
              prev
                .filter((a) => a.time24 === time24)
                .forEach((removed) => queueSyncMutation('alarms', removed.id, 'delete', nowMs));
              return prev.filter((a) => a.time24 !== time24);
            });
          } else if (action === 'toggle') {
            setAlarms((prev) =>
              prev.map((a) => {
                if (a.time24 !== time24) return a;
                const updated = { ...a, enabled: !a.enabled, updatedAtMs: nowMs };
                queueSyncMutation('alarms', updated.id, 'upsert', nowMs, updated);
                return updated;
              })
            );
          } else {
            const created: AlarmItem = {
              id: `alarm-${nowMs}`,
              time24,
              label,
              enabled: true,
              repeatDays: ['Daily'],
              updatedAtMs: nowMs,
            };
            setAlarms((prev) => [created, ...prev]);
            queueSyncMutation('alarms', created.id, 'upsert', nowMs, created);
          }
        } else if (act.type === 'manageTask') {
          const action = String(act.args.action ?? 'add');
          const title = String(act.args.title ?? 'Untitled task');
          const nowMs = Date.now();
          if (action === 'add') {
            const created: TaskItem = {
              id: `task-${nowMs}`,
              title,
              dueTime: String(act.args.dueTime ?? 'Today'),
              priority: (act.args.priority as TaskItem['priority']) || 'medium',
              category: (act.args.category as TaskItem['category']) || 'personal',
              completed: false,
              updatedAtMs: nowMs,
            };
            setTasks((prev) => [created, ...prev]);
            queueSyncMutation('tasks', created.id, 'upsert', nowMs, created);
          } else if (action === 'complete') {
            const needle = title.toLowerCase();
            setTasks((prev) =>
              prev.map((t) => {
                if (!t.title.toLowerCase().includes(needle)) return t;
                const updated = { ...t, completed: true, updatedAtMs: nowMs };
                queueSyncMutation('tasks', updated.id, 'upsert', nowMs, updated);
                return updated;
              })
            );
          } else if (action === 'delete') {
            const needle = title.toLowerCase();
            setTasks((prev) => {
              prev
                .filter((t) => t.title.toLowerCase().includes(needle))
                .forEach((removed) => queueSyncMutation('tasks', removed.id, 'delete', nowMs));
              return prev.filter((t) => !t.title.toLowerCase().includes(needle));
            });
          }
        } else if (act.type === 'runSecurityAudit') {
          handleStartScan();
        } else if (act.type === 'adaptCommandCode') {
          const code = String(act.args.code ?? '').trim();
          const description = String(act.args.description ?? 'Custom adapted command');
          if (code) {
            const newCode: AdaptedCommandCode = {
              id: `code-${Date.now()}`,
              code,
              description,
              actions: [
                {
                  ...(act.args.setting ? { setting: String(act.args.setting) } : {}),
                  ...(typeof act.args.booleanValue === 'boolean'
                    ? { booleanValue: act.args.booleanValue }
                    : {}),
                  ...(typeof act.args.numericValue === 'number'
                    ? { numericValue: act.args.numericValue }
                    : {}),
                  ...(act.args.alarmTime ? { alarmTime: String(act.args.alarmTime) } : {}),
                  ...(act.args.alarmLabel ? { alarmLabel: String(act.args.alarmLabel) } : {}),
                },
              ],
              createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setAdaptedCodes((prev) => [newCode, ...prev]);
          }
        } else if (act.type === 'generatePicture' || act.type === 'generateVectorArt') {
          const prompt = String(act.args.prompt ?? 'Atmospheric twilight mountain observatory');
          const aspectRatio = String(act.args.aspectRatio ?? '1:1');
          const stylePreset = act.args.stylePreset
            ? (String(act.args.stylePreset) as GeneratedImageRecord['stylePreset'])
            : 'auto';

          const runExplicitVectorArt = async () => {
            let svgMarkup = '';
            if (!effectiveOffline) {
              try {
                const vecRes = await fetch('/api/nova/generate-vector-art', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt, aspectRatio }),
                });
                const vecData = await vecRes.json();
                if (vecRes.ok && vecData.svgMarkup) {
                  svgMarkup = vecData.svgMarkup;
                }
              } catch {
                // fall through to offline procedural vector diagram
              }
            }
            if (!svgMarkup) {
              svgMarkup = createOfflineProceduralSvg(prompt, aspectRatio);
            }
            const pngUrl = await svgToPngDataUrl(svgMarkup, aspectRatio);
            generatedImageUrl = pngUrl;
            const rec: GeneratedImageRecord = {
              id: `img-${Date.now()}`,
              prompt,
              aspectRatio,
              sourceKind: 'ai_generated',
              provider: 'Nova Vector SVG',
              dataUrl: pngUrl,
              createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setSavedImages((prev) => [rec, ...prev]);
            const nowMs = Date.now();
            const idxItem: MobileIndexItem = {
              id: `idx-${nowMs}`,
              title: `Nova_Vector_${rec.id.slice(-4)}.png`,
              subtitle: `Vector SVG · ${aspectRatio}`,
              type: 'image',
              sizeOrMeta: aspectRatio,
              updatedAt: 'Just now',
              contentPreview: prompt,
              updatedAtMs: nowMs,
            };
            setMobileIndex((prev) => [idxItem, ...prev]);
            queueSyncMutation('indexedFiles', idxItem.id, 'upsert', nowMs, idxItem);
          };

          if (act.type === 'generateVectorArt') {
            await runExplicitVectorArt();
          } else if (effectiveOffline) {
            if (targetMessageId) {
              setMessages(
                (prev) =>
                  prev.map((m) =>
                    m.id === targetMessageId
                      ? {
                          ...m,
                          text: `${m.text ? `${m.text}\n\n` : ''}⚠️ **Offline Mode:** High-resolution Gemini AI image generation requires a live network connection. Reconnect and retry, or ask specifically for an offline vector diagram.`,
                        }
                      : m
                  ),
                targetSessionId
              );
            }
          } else {
            try {
              const res = await fetch('/api/nova/media-studio/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt,
                  aspectRatio,
                  imageSize: '2K',
                  quality: 'pro',
                  stylePreset,
                  enhancePrompt: true,
                }),
              });
              const data = await res.json();
              if (res.ok && data.imageDataUrl) {
                generatedImageUrl = data.imageDataUrl;
                const rec: GeneratedImageRecord = {
                  id: `img-${Date.now()}`,
                  prompt,
                  enhancedPrompt: data.enhancedPromptUsed || prompt,
                  stylePreset,
                  aspectRatio: data.aspectRatio || aspectRatio,
                  imageSize: (data.imageSize || '2K') as '1K' | '2K' | '4K',
                  width: typeof data.width === 'number' ? data.width : undefined,
                  height: typeof data.height === 'number' ? data.height : undefined,
                  byteLength: typeof data.byteLength === 'number' ? data.byteLength : undefined,
                  mimeType: data.mimeType || 'image/png',
                  modelUsed: data.modelUsed || 'gemini-nano-banana-2.1',
                  sourceKind: 'ai_generated',
                  provider: 'Gemini Image',
                  dataUrl: data.imageDataUrl,
                  createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
                setSavedImages((prev) => [rec, ...prev]);
                const nowMs = Date.now();
                const resLabel =
                  rec.width && rec.height
                    ? `${rec.width}×${rec.height}`
                    : `${rec.aspectRatio} ${rec.imageSize || ''}`.trim();
                const idxItem: MobileIndexItem = {
                  id: `idx-${nowMs}`,
                  title: `AI_Art_${rec.id.slice(-4)}.png`,
                  subtitle: `Gemini Image · ${resLabel}`,
                  type: 'image',
                  sizeOrMeta: resLabel,
                  updatedAt: 'Just now',
                  contentPreview: prompt,
                  updatedAtMs: nowMs,
                };
                setMobileIndex((prev) => [idxItem, ...prev]);
                queueSyncMutation('indexedFiles', idxItem.id, 'upsert', nowMs, idxItem);
              } else {
                const errDetail =
                  data.error || `Gemini Image returned HTTP ${res.status}.`;
                setErrorBanner(errDetail);
                if (targetMessageId) {
                  setMessages(
                    (prev) =>
                      prev.map((m) =>
                        m.id === targetMessageId
                          ? {
                              ...m,
                              text: `${m.text ? `${m.text}\n\n` : ''}⚠️ **AI Image Generation Blocked:** ${errDetail}${
                                data.paidKeyRequired
                                  ? ' Real licensed photography remains available immediately in **Image Studio → Real Photos**.'
                                  : ''
                              }`,
                            }
                          : m
                      ),
                    targetSessionId
                  );
                }
              }
            } catch (imgErr) {
              const errMsg =
                imgErr instanceof Error
                  ? imgErr.message
                  : 'Unable to reach Gemini Image endpoint.';
              setErrorBanner(errMsg);
              if (targetMessageId) {
                setMessages(
                  (prev) =>
                    prev.map((m) =>
                      m.id === targetMessageId
                        ? {
                            ...m,
                            text: `${m.text ? `${m.text}\n\n` : ''}⚠️ **AI Image Error:** ${errMsg}`,
                          }
                        : m
                    ),
                  targetSessionId
                );
              }
            }
          }
        } else if (act.type === 'generateQuickCommandKey') {
          const label = String(act.args.label ?? 'Quick Command');
          const commandPrompt = String(act.args.commandPrompt ?? 'turn on dnd');
          const opRaw = String(act.args.operationType ?? 'macro');
          const operationType: QuickCommandKey['operationType'] =
            opRaw === 'generate-pdf' || opRaw === 'generate-art' || opRaw === 'security-lockdown'
              ? opRaw
              : 'macro';
          const newKey: QuickCommandKey = {
            id: `qkey-${Date.now()}`,
            passkey: generateLocalCommandPasskey(),
            label,
            commandPrompt,
            operationType,
            createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setCommandKeys((prev) => [newKey, ...prev]);
        } else if (act.type === 'generatePdfDocument') {
          const topic = String(act.args.topic ?? 'Document');
          const title = String(act.args.title ?? topic.slice(0, 50));
          const tone = String(act.args.tone ?? 'professional');
          try {
            if (effectiveOffline) {
              generatedPdf = createFormattedPdf({
                title,
                subtitle: 'Generated Offline by Nova Edge Studio',
                sections: [
                  {
                    heading: 'Summary',
                    paragraphs: [`Offline document generated for: ${topic}`],
                  },
                ],
              });
            } else {
              const res = await fetch('/api/nova/generate-pdf-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, title, tone }),
              });
              const data = await res.json();
              if (res.ok && data.sections) {
                generatedPdf = createFormattedPdf(data);
              }
            }
            if (generatedPdf) {
              setSavedPdfs((prev) => [generatedPdf!, ...prev]);
              const nowMs = Date.now();
              const idxItem: MobileIndexItem = {
                id: `idx-pdf-${nowMs}`,
                title: `${generatedPdf!.title.replace(/[^a-z0-9_-]+/gi, '_')}.pdf`,
                subtitle: `Generated PDF · ${generatedPdf!.pageCount} pages`,
                type: 'pdf',
                sizeOrMeta: `${generatedPdf!.pageCount}p`,
                updatedAt: 'Just now',
                updatedAtMs: nowMs,
              };
              setMobileIndex((prev) => [idxItem, ...prev]);
              queueSyncMutation('indexedFiles', idxItem.id, 'upsert', nowMs, idxItem);
            }
          } catch {
            // ignore
          }
        } else if (act.type === 'suggestMemory') {
          const content = String(act.args.content ?? '').trim();
          const catRaw = String(act.args.category ?? 'preference');
          const category: MemoryItem['category'] =
            catRaw === 'fact' || catRaw === 'workflow' || catRaw === 'project'
              ? catRaw
              : 'preference';
          if (content) {
            setPendingMemorySuggestions((prev) =>
              prev.some((p) => p.content.toLowerCase() === content.toLowerCase())
                ? prev
                : [...prev, { id: `memsug-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, content, category }]
            );
          }
        }
      }

      if (targetMessageId && (generatedImageUrl || generatedPdf)) {
        setMessages(
          (prev) =>
            prev.map((m) =>
              m.id === targetMessageId
                ? {
                    ...m,
                    ...(generatedImageUrl ? { generatedImageUrl } : {}),
                    ...(generatedPdf ? { generatedPdf } : {}),
                  }
                : m
            ),
          targetSessionId
        );
      }

      return { generatedImageUrl, generatedPdf };
    },
    [
      effectiveOffline,
      handleStartScan,
      handleToggleSetting,
      isUnlocked,
      queueSyncMutation,
      requestBiometricFor,
      setMessages,
    ]
  );

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSendingRef.current = false;
    setOrbState('idle');
  }, []);

  const retrieveRelevantMemories = useCallback(
    (query: string, scopedProjectId?: string | null): MemoryItem[] => {
      const targetProjId = scopedProjectId !== undefined ? scopedProjectId : activeProjectId;
      // Strict isolation: retrieve general memories OR memories belonging strictly to targetProjId
      const approved = memories.filter((m) => {
        if (!m.approved || !m.active) return false;
        const mScope = m.scope || (m.projectId ? 'project' : 'general');
        if (mScope === 'general') return true;
        return Boolean(targetProjId && m.projectId === targetProjId);
      });
      if (approved.length === 0) return [];
      const tokens = query
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length >= 3);
      return [...approved]
        .sort((a, b) => {
          const scoreA = tokens.reduce(
            (sum, tok) => sum + (a.content.toLowerCase().includes(tok) ? 1 : 0),
            0
          );
          const scoreB = tokens.reduce(
            (sum, tok) => sum + (b.content.toLowerCase().includes(tok) ? 1 : 0),
            0
          );
          if (scoreB !== scoreA) return scoreB - scoreA;
          return b.updatedAtMs - a.updatedAtMs;
        })
        .slice(0, 8);
    },
    [activeProjectId, memories]
  );

  const sendMessageToNova = useCallback(
    async (
      rawText: string,
      options?: {
        baseHistoryOverride?: ChatMessage[];
        sessionIdOverride?: string;
        reuseAttachments?: ChatAttachment[];
      }
    ) => {
      const trimmed = rawText.trim();
      const activeAttachments = options?.reuseAttachments ?? [...attachments];
      if (!trimmed && activeAttachments.length === 0) return;
      if (isSendingRef.current) return;

      isSendingRef.current = true;
      setErrorBanner(null);

      const targetSessionId = options?.sessionIdOverride ?? activeSession.id;
      const targetSessionObj = sessions.find((s) => s.id === targetSessionId) ?? activeSession;
      const baseHistory = options?.baseHistoryOverride ?? targetSessionObj.messages;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed || `Attached ${activeAttachments.map((a) => a.name).join(', ')}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachmentNames: activeAttachments.map((a) => a.name),
      };

      const nextHistory = [...baseHistory, userMsg];
      setMessages(nextHistory, targetSessionId);
      if (!options?.baseHistoryOverride) {
        setInputText('');
        setAttachments([]);
      }

      // 1. Instant <5ms Express Command Fast-Path
      if (activeAttachments.length === 0) {
        const instant = tryInstantLocalCommand({
          text: trimmed,
          adaptedCodes,
          commandKeys,
        });
        if (instant) {
          const replyId = `a-${Date.now()}`;
          const needsAsyncArtifact = instant.actions.some(
            (a) =>
              a.type === 'generatePdfDocument' ||
              a.type === 'generatePicture' ||
              a.type === 'generateVectorArt'
          );
          const replyMsg: ChatMessage = {
            id: replyId,
            role: 'assistant',
            text: instant.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            actions: instant.actions,
            offlineProcessed: effectiveOffline,
            streaming: needsAsyncArtifact,
            modeUsed: targetSessionObj.mode,
          };
          setMessages((prev) => [...prev, replyMsg], targetSessionId);
          if (instant.passkeyUsed) {
            const usedId = instant.passkeyUsed.id;
            setCommandKeys((prev) =>
              prev.map((k) =>
                k.id === usedId
                  ? {
                      ...k,
                      lastUsedAt: new Date().toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    }
                  : k
              )
            );
          }
          if (needsAsyncArtifact) setOrbState('thinking');
          await applyToolActions(instant.actions, replyId, targetSessionId);
          if (needsAsyncArtifact) {
            setMessages(
              (prev) => prev.map((m) => (m.id === replyId ? { ...m, streaming: false } : m)),
              targetSessionId
            );
          }
          isSendingRef.current = false;
          if (voiceReply) {
            void speakResponse(instant.reply);
          } else {
            setOrbState('idle');
          }
          return;
        }
      }

      setOrbState('thinking');

      // 2. Offline Edge Processing
      if (effectiveOffline) {
        const offlineRes = processOfflineRequest({
          text: trimmed,
          device,
          tasks,
          mobileIndex,
          adaptedCodes,
          commandKeys,
        });
        const replyId = `a-${Date.now()}`;
        const replyMsg: ChatMessage = {
          id: replyId,
          role: 'assistant',
          text: offlineRes.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actions: offlineRes.actions,
          offlineProcessed: true,
          modeUsed: targetSessionObj.mode,
        };
        setMessages((prev) => [...prev, replyMsg], targetSessionId);
        if (offlineRes.actions.length > 0) {
          await applyToolActions(offlineRes.actions, replyId, targetSessionId);
        }
        isSendingRef.current = false;
        if (voiceReply) {
          void speakResponse(offlineRes.reply);
        } else {
          setOrbState('idle');
        }
        return;
      }

      // 3. Online Streaming SSE Reply with AbortController, 24-turn context, AI modes, memories & personalisation
      const replyId = `a-${Date.now()}`;
      const placeholderMsg: ChatMessage = {
        id: replyId,
        role: 'assistant',
        text: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        streaming: true,
        modeUsed: targetSessionObj.mode,
      };
      setMessages((prev) => [...prev, placeholderMsg], targetSessionId);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const sessionProjectId = targetSessionObj.projectId ?? activeProjectId;
        const sessionProject = projects.find((p) => p.id === sessionProjectId) ?? null;
        const relevantMemories = retrieveRelevantMemories(trimmed, sessionProject?.id ?? null);
        const manualSkills = skills.filter((s) => s.enabled);
        const autoMatched = detectRelevantSkills(trimmed, skills);
        const combinedSkillsMap = new Map<string, NovaSkill>();
        for (const sk of [...manualSkills, ...autoMatched]) {
          combinedSkillsMap.set(sk.id, sk);
        }
        const activeSkillsPayload = Array.from(combinedSkillsMap.values()).map((s) => ({
          name: s.name,
          instructions: s.instructions,
        }));

        const res = await fetch('/api/nova/chat-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: nextHistory.slice(-24).map((m) => ({ role: m.role, text: m.text })),
            attachments: activeAttachments.map((a) => ({
              name: a.name,
              mimeType: a.mimeType,
              dataBase64: a.dataBase64,
            })),
            reasoningMode,
            aiMode: targetSessionObj.mode,
            preferredModel,
            personalisation,
            memories: relevantMemories,
            conversationSummary: targetSessionObj.summary || '',
            activeProject: sessionProject
              ? {
                  name: sessionProject.name,
                  instructions: sessionProject.instructions,
                  documents: sessionProject.documents.map((d) => ({
                    name: d.name,
                    folder: d.folder,
                    excerpt: d.content.slice(0, 400),
                  })),
                }
              : null,
            activeSkills: activeSkillsPayload,
            deviceState: device,
            tasks,
            mobileIndex,
            adaptedCodes,
            slangMirroring,
            proactiveMode,
            biometricVerified: isUnlocked,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Nova could not respond right now.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalStreamText = '';
        let finalActions: NovaToolAction[] = [];
        let finalSources: Array<{ title: string; uri: string }> = [];
        let modelUsed = '';
        let streamError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';

          for (const block of blocks) {
            const lines = block.split('\n');
            let eventName = 'message';
            let dataRaw = '';
            for (const line of lines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
            }
            if (!dataRaw) continue;
            try {
              const payload = JSON.parse(dataRaw);
              if (eventName === 'delta' && typeof payload.text === 'string') {
                finalStreamText += payload.text;
                const snapshot = finalStreamText;
                setMessages(
                  (prev) => prev.map((m) => (m.id === replyId ? { ...m, text: snapshot } : m)),
                  targetSessionId
                );
              } else if (eventName === 'actions' && Array.isArray(payload.actions)) {
                finalActions = payload.actions;
                setMessages(
                  (prev) => prev.map((m) => (m.id === replyId ? { ...m, actions: finalActions } : m)),
                  targetSessionId
                );
              } else if (eventName === 'done') {
                if (typeof payload.text === 'string' && payload.text) {
                  finalStreamText = payload.text;
                }
                if (Array.isArray(payload.actions)) finalActions = payload.actions;
                if (Array.isArray(payload.sources)) finalSources = payload.sources;
                if (typeof payload.modelUsed === 'string') modelUsed = payload.modelUsed;
              } else if (eventName === 'error') {
                streamError = payload.error || 'Nova encountered a temporary error.';
              }
            } catch {
              // ignore partial frame
            }
          }
        }

        if (streamError) {
          throw new Error(streamError);
        }

        setMessages(
          (prev) =>
            prev.map((m) =>
              m.id === replyId
                ? {
                    ...m,
                    text: finalStreamText || 'Done — updated for you.',
                    actions: finalActions,
                    sources: finalSources,
                    modelUsed: modelUsed || m.modelUsed,
                    streaming: false,
                  }
                : m
            ),
          targetSessionId
        );

        const lowerCmd = trimmed.toLowerCase();
        const isExplicitArtCommand =
          (/\b(picture|pictures|pic|pics|image|images|photo|wallpaper|wallpapers|art|artwork|artworks|illustration|illustrations|drawing|sketch|paint|painting|poster|portrait|logo|avatar)\b/.test(
            lowerCmd
          ) &&
            /\b(make|create|generate|draw|build|render|design|paint|sketch|give|show)\b/.test(
              lowerCmd
            )) ||
          /^(draw|sketch|paint)\s+/i.test(lowerCmd);

        const actionsToRun = [...finalActions];
        if (
          isExplicitArtCommand &&
          !actionsToRun.some((a) => a.type === 'generatePicture' || a.type === 'generateVectorArt')
        ) {
          const inferredRatio = /\b(wallpaper|phone|portrait|vertical|9:16)\b/.test(lowerCmd)
            ? '9:16'
            : /\b(landscape|banner|wide|16:9|desktop|laptop)\b/.test(lowerCmd)
            ? '16:9'
            : '1:1';
          const wantsRawSvg = /\b(svg|vector\s+icon|wireframe\s+svg)\b/i.test(lowerCmd);
          const autoArtAction: NovaToolAction = {
            type: wantsRawSvg ? 'generateVectorArt' : 'generatePicture',
            args: { prompt: trimmed, aspectRatio: inferredRatio, stylePreset: 'auto' },
            resultText: wantsRawSvg
              ? 'Generated vector SVG artwork.'
              : 'Generating high-resolution AI artwork via Gemini Image.',
          };
          actionsToRun.push(autoArtAction);
          setMessages(
            (prev) => prev.map((m) => (m.id === replyId ? { ...m, actions: actionsToRun } : m)),
            targetSessionId
          );
        }

        if (actionsToRun.length > 0) {
          await applyToolActions(actionsToRun, replyId, targetSessionId);
        }

        if (voiceReply) {
          void speakResponse(finalStreamText);
        } else {
          setOrbState('idle');
        }
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort) {
          setMessages(
            (prev) =>
              prev.map((m) =>
                m.id === replyId
                  ? {
                      ...m,
                      text: m.text ? `${m.text}\n\n_(Generation stopped by user)_` : 'Generation stopped.',
                      streaming: false,
                    }
                  : m
              ),
            targetSessionId
          );
        } else {
          const msg = err instanceof Error ? err.message : 'Connection error';
          setMessages(
            (prev) => prev.filter((m) => m.id !== replyId || m.text.trim().length > 0),
            targetSessionId
          );
          setErrorBanner(msg);
        }
        setOrbState('idle');
      } finally {
        abortControllerRef.current = null;
        isSendingRef.current = false;
      }
    },
    [
      activeProjectId,
      activeSession,
      adaptedCodes,
      applyToolActions,
      attachments,
      commandKeys,
      device,
      effectiveOffline,
      isUnlocked,
      mobileIndex,
      personalisation,
      preferredModel,
      proactiveMode,
      projects,
      reasoningMode,
      retrieveRelevantMemories,
      sessions,
      setMessages,
      skills,
      slangMirroring,
      speakResponse,
      tasks,
      voiceReply,
    ]
  );

  const handleRegenerateResponse = useCallback(
    (assistantMessageId: string) => {
      const idx = messages.findIndex((m) => m.id === assistantMessageId);
      if (idx === -1) return;
      let userIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userIdx = i;
          break;
        }
      }
      if (userIdx === -1) return;
      const targetUserText = messages[userIdx].text;
      const historyBeforeUser = messages.slice(0, userIdx);
      void sendMessageToNova(targetUserText, {
        baseHistoryOverride: historyBeforeUser,
        sessionIdOverride: activeSession.id,
        reuseAttachments: [],
      });
    },
    [activeSession.id, messages, sendMessageToNova]
  );

  const handleSaveEditedUserMessage = useCallback(
    (userMessageId: string) => {
      const nextText = editingDraft.trim();
      if (!nextText) return;
      const idx = messages.findIndex((m) => m.id === userMessageId);
      if (idx === -1) return;
      setEditingMessageId(null);
      setEditingDraft('');
      const historyBefore = messages.slice(0, idx);
      void sendMessageToNova(nextText, {
        baseHistoryOverride: historyBefore,
        sessionIdOverride: activeSession.id,
        reuseAttachments: [],
      });
    },
    [activeSession.id, editingDraft, messages, sendMessageToNova]
  );

  const handleSummarizeSession = useCallback(
    async (sessionId: string) => {
      const target = sessions.find((s) => s.id === sessionId);
      if (!target || target.messages.length < 2) return;
      setSummarizingId(sessionId);
      setErrorBanner(null);
      try {
        const res = await fetch('/api/nova/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: target.messages.slice(-24).map((m) => ({ role: m.role, text: m.text })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Summarization failed');
        updateSessionById(sessionId, (s) => ({
          ...s,
          title: data.title || s.title,
          summary: data.summary || s.summary,
          updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          updatedAtMs: Date.now(),
        }));
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Unable to summarize conversation');
      } finally {
        setSummarizingId(null);
      }
    },
    [sessions, updateSessionById]
  );

  // Autonomous Multi-Step Agent Engine
  const finalizeAgentPlan = useCallback(async (planToFinalize: AgentRunPlan) => {
    try {
      const res = await fetch('/api/nova/agent/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: planToFinalize.objective,
          steps: planToFinalize.steps.map((s) => ({
            title: s.title,
            tool: s.tool,
            status: s.status,
            result: s.result,
            error: s.error,
          })),
        }),
      });
      const data = await res.json();
      setAgentPlan((prev) =>
        prev && prev.id === planToFinalize.id
          ? {
              ...prev,
              status: 'completed',
              finalReport: data.report || 'Agent execution verified.',
            }
          : prev
      );
    } catch {
      setAgentPlan((prev) =>
        prev && prev.id === planToFinalize.id
          ? {
              ...prev,
              status: 'completed',
              finalReport: 'All resolved steps completed.',
            }
          : prev
      );
    }
  }, []);

  const executeAgentStepAt = useCallback(
    async (planSnapshot: AgentRunPlan, stepIdx: number, bypassConfirmation = false) => {
      if (stepIdx >= planSnapshot.steps.length) {
        await finalizeAgentPlan(planSnapshot);
        return;
      }

      const step = planSnapshot.steps[stepIdx];
      if (step.status === 'completed' || step.status === 'skipped') {
        await executeAgentStepAt(planSnapshot, stepIdx + 1, false);
        return;
      }

      if (step.requiresConfirmation && !bypassConfirmation) {
        const pausedSteps = planSnapshot.steps.map((s, idx) =>
          idx === stepIdx ? { ...s, status: 'awaiting_confirmation' as const } : s
        );
        const pausedPlan: AgentRunPlan = {
          ...planSnapshot,
          status: 'paused_for_confirm',
          steps: pausedSteps,
        };
        setAgentPlan(pausedPlan);
        return;
      }

      const runningSteps = planSnapshot.steps.map((s, idx) =>
        idx === stepIdx ? { ...s, status: 'running' as const, error: undefined } : s
      );
      let workingPlan: AgentRunPlan = {
        ...planSnapshot,
        status: 'running',
        steps: runningSteps,
      };
      setAgentPlan(workingPlan);

      try {
        let stepResult = '';
        if (step.tool === 'vault_search') {
          const query = String(step.args.query ?? '').toLowerCase();
          const hits = mobileIndex.filter(
            (i) =>
              i.title.toLowerCase().includes(query) ||
              i.subtitle.toLowerCase().includes(query) ||
              (i.contentPreview ?? '').toLowerCase().includes(query)
          );
          stepResult =
            hits.length > 0
              ? `Found ${hits.length} local vault item(s): ${hits
                  .slice(0, 5)
                  .map((h) => h.title)
                  .join(', ')}`
              : 'No matching local vault items found for query.';
        } else if (step.tool === 'create_task') {
          await applyToolActions([
            {
              type: 'manageTask',
              args: { action: 'add', ...step.args },
              resultText: 'Created task',
            },
          ]);
          stepResult = `Added task "${String(step.args.title ?? 'Agent task')}" (${String(
            step.args.dueTime ?? 'Today'
          )}).`;
        } else if (step.tool === 'set_alarm') {
          await applyToolActions([
            {
              type: 'setAlarm',
              args: { action: 'set', ...step.args },
              resultText: 'Set alarm',
            },
          ]);
          stepResult = `Scheduled alarm at ${String(step.args.time ?? '07:30')} (${String(
            step.args.label ?? 'Agent Alarm'
          )}).`;
        } else if (step.tool === 'device_control') {
          await applyToolActions([
            {
              type: 'controlDeviceSetting',
              args: step.args,
              resultText: 'Updated device setting',
            },
          ]);
          stepResult = `Updated device setting: ${String(step.args.setting ?? '')}.`;
        } else if (step.tool === 'security_scan') {
          await applyToolActions([
            {
              type: 'runSecurityAudit',
              args: step.args,
              resultText: 'Security audit launched',
            },
          ]);
          const flagged = securityAudits.filter((a) => a.status === 'flagged').length;
          stepResult = `Completed device security sweep across ${securityAudits.length} packages (${flagged} flagged).`;
        } else if (step.tool === 'generate_pdf') {
          const out = await applyToolActions([
            {
              type: 'generatePdfDocument',
              args: step.args,
              resultText: 'Generated PDF document',
            },
          ]);
          stepResult = out.generatedPdf
            ? `Generated PDF "${out.generatedPdf.title}.pdf" (${out.generatedPdf.pageCount} pages) and saved to Studio.`
            : 'Generated PDF document.';
        } else if (step.tool === 'generate_art') {
          const out = await applyToolActions([
            {
              type: 'generatePicture',
              args: step.args,
              resultText: 'Generated high-resolution AI artwork',
            },
          ]);
          stepResult = out.generatedImageUrl
            ? `Generated custom artwork (${String(step.args.aspectRatio ?? '1:1')}) and saved to Studio Gallery.`
            : 'Artwork generation requires an active billing-enabled Gemini key.';
        } else {
          // web_research or reason_analyze via server
          const priorResults = workingPlan.steps
            .filter((s) => s.status === 'completed' && s.result)
            .map((s) => ({ title: s.title, result: s.result }));
          const res = await fetch('/api/nova/agent/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              objective: workingPlan.objective,
              step,
              priorResults,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Agent step failed');
          stepResult = String(data.result || 'Step completed.');
        }

        const doneSteps = workingPlan.steps.map((s, idx) =>
          idx === stepIdx ? { ...s, status: 'completed' as const, result: stepResult } : s
        );
        workingPlan = { ...workingPlan, steps: doneSteps };
        setAgentPlan(workingPlan);

        await executeAgentStepAt(workingPlan, stepIdx + 1, false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Step execution error';
        const failedSteps = workingPlan.steps.map((s, idx) =>
          idx === stepIdx ? { ...s, status: 'failed' as const, error: message } : s
        );
        setAgentPlan({
          ...workingPlan,
          status: 'failed',
          steps: failedSteps,
        });
      }
    },
    [applyToolActions, finalizeAgentPlan, mobileIndex, securityAudits]
  );

  const handleStartAgentObjective = useCallback(
    async (objective: string) => {
      const planId = `agent-${Date.now()}`;
      const initialPlan: AgentRunPlan = {
        id: planId,
        objective,
        status: 'planning',
        steps: [],
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setAgentPlan(initialPlan);
      try {
        const res = await fetch('/api/nova/agent/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            objective,
            deviceState: device,
            tasks,
            mobileIndex,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to plan objective');
        const nextPlan: AgentRunPlan = {
          ...initialPlan,
          status: 'running',
          steps: (data.steps ?? []) as AgentStep[],
        };
        setAgentPlan(nextPlan);
        await executeAgentStepAt(nextPlan, 0, false);
      } catch (err) {
        setAgentPlan({
          ...initialPlan,
          status: 'failed',
          finalReport: err instanceof Error ? err.message : 'Agent planning failed.',
        });
      }
    },
    [device, executeAgentStepAt, mobileIndex, tasks]
  );

  const handleApproveAgentStep = useCallback(
    (stepId: string) => {
      if (!agentPlan) return;
      const idx = agentPlan.steps.findIndex((s) => s.id === stepId);
      if (idx === -1) return;
      void executeAgentStepAt(agentPlan, idx, true);
    },
    [agentPlan, executeAgentStepAt]
  );

  const handleSkipAgentStep = useCallback(
    (stepId: string) => {
      if (!agentPlan) return;
      const idx = agentPlan.steps.findIndex((s) => s.id === stepId);
      if (idx === -1) return;
      const updatedSteps = agentPlan.steps.map((s) =>
        s.id === stepId ? { ...s, status: 'skipped' as const, result: 'Skipped by user.' } : s
      );
      const updatedPlan: AgentRunPlan = { ...agentPlan, steps: updatedSteps, status: 'running' };
      setAgentPlan(updatedPlan);
      void executeAgentStepAt(updatedPlan, idx + 1, false);
    },
    [agentPlan, executeAgentStepAt]
  );

  const handleRetryAgentStep = useCallback(
    (stepId: string) => {
      if (!agentPlan) return;
      const idx = agentPlan.steps.findIndex((s) => s.id === stepId);
      if (idx === -1) return;
      void executeAgentStepAt(agentPlan, idx, agentPlan.steps[idx].requiresConfirmation);
    },
    [agentPlan, executeAgentStepAt]
  );

  // Dual Voice Capture: Web Speech API + MediaRecorder -> Gemini Transcribe
  const stopVoiceCapture = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleListening = useCallback(async () => {
    if (orbState === 'listening') {
      stopVoiceCapture();
      setOrbState('idle');
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setErrorBanner(null);

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = navigator.language || 'en-US';
        let captured = '';

        rec.onresult = (event) => {
          const transcript = event.results[0]?.[0]?.transcript || '';
          captured = transcript.trim();
        };

        rec.onerror = (ev) => {
          if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
            setErrorBanner(`Voice input error: ${ev.error}. You can also type below.`);
          }
          setOrbState('idle');
        };

        rec.onend = () => {
          recognitionRef.current = null;
          if (captured) {
            void sendMessageToNova(captured);
          } else {
            setOrbState('idle');
          }
        };

        recognitionRef.current = rec;
        setOrbState('listening');
        rec.start();
        return;
      } catch {
        // Fall through
      }
    }

    if (navigator.mediaDevices?.getUserMedia && !effectiveOffline) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size < 400) {
            setOrbState('idle');
            return;
          }
          setOrbState('thinking');
          try {
            const reader = new FileReader();
            const base64: string = await new Promise((resolve, reject) => {
              reader.onloadend = () => {
                const resStr = String(reader.result || '');
                resolve(resStr.split(',')[1] || '');
              };
              reader.onerror = () => reject(new Error('Failed to read audio'));
              reader.readAsDataURL(blob);
            });
            const trRes = await fetch('/api/nova/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: recorder.mimeType || 'audio/webm',
              }),
            });
            const trData = await trRes.json();
            if (!trRes.ok) throw new Error(trData.error || 'Transcription failed');
            if (trData.text) {
              await sendMessageToNova(trData.text);
            } else {
              setOrbState('idle');
            }
          } catch (err) {
            setErrorBanner(err instanceof Error ? err.message : 'Audio transcription failed.');
            setOrbState('idle');
          }
        };

        mediaRecorderRef.current = recorder;
        setOrbState('listening');
        recorder.start();
      } catch {
        setErrorBanner('Microphone permission was denied. Allow mic access or type below.');
        setOrbState('idle');
      }
    } else {
      setErrorBanner('Speech dictation requires browser speech support or online transcription.');
    }
  }, [effectiveOffline, orbState, sendMessageToNova, stopVoiceCapture]);

  const handleAttachFiles = async (fileList: FileList) => {
    const next: ChatAttachment[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.size > 10 * 1024 * 1024) {
        setErrorBanner(`"${f.name}" exceeds the 10 MB attachment size limit.`);
        continue;
      }
      const buf = await f.arrayBuffer();
      const dataBase64 = uint8ToBase64(new Uint8Array(buf));
      next.push({
        id: `att-${Date.now()}-${i}`,
        name: f.name,
        mimeType: f.type || 'application/octet-stream',
        dataBase64,
        sizeLabel: `${Math.max(1, Math.round(f.size / 1024))} KB`,
      });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 3));
  };

  const handleIndexLocalFiles = useCallback(
    async (fileList: FileList) => {
      const additions: MobileIndexItem[] = [];
      const baseMs = Date.now();
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        let preview = '';
        if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.json')) {
          try {
            preview = (await file.text()).slice(0, 220);
          } catch {
            preview = '';
          }
        }
        const nowMs = baseMs + i;
        const item: MobileIndexItem = {
          id: `file-${nowMs}-${i}`,
          title: file.name,
          subtitle: `Indexed Phone File · ${file.type || 'Document'}`,
          type: file.type === 'application/pdf' ? 'pdf' : 'file',
          sizeOrMeta:
            file.size > 1024 * 1024
              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
              : `${Math.max(1, Math.round(file.size / 1024))} KB`,
          updatedAt: 'Indexed just now',
          contentPreview: preview || undefined,
          updatedAtMs: nowMs,
        };
        additions.push(item);
        queueSyncMutation('indexedFiles', item.id, 'upsert', nowMs, item);
      }
      setMobileIndex((prev) => [...additions, ...prev]);
    },
    [queueSyncMutation]
  );

  const handleActivateHealthyNova = useCallback(
    (preset: 'hydration' | 'eyes' | 'posture' | 'sleep') => {
      const nowMs = Date.now();
      if (preset === 'sleep') {
        const sleepAlarm: AlarmItem = {
          id: `alarm-sleep-${nowMs}`,
          time24: '22:30',
          label: 'Healthy Nova · Sleep Wind-Down',
          enabled: true,
          repeatDays: ['Daily'],
          updatedAtMs: nowMs,
        };
        const sleepTask: TaskItem = {
          id: `task-sleep-${nowMs}`,
          title: 'Digital sunset & 22:30 sleep wind-down routine',
          dueTime: 'Tonight · 10:30 PM',
          priority: 'high',
          category: 'health',
          completed: false,
          proactiveNote: 'Healthy Nova dims bright screens before bed for deeper rest.',
          updatedAtMs: nowMs,
        };
        setAlarms((prev) => [sleepAlarm, ...prev]);
        setTasks((prev) => [sleepTask, ...prev]);
        queueSyncMutation('alarms', sleepAlarm.id, 'upsert', nowMs, sleepAlarm);
        queueSyncMutation('tasks', sleepTask.id, 'upsert', nowMs, sleepTask);
        return;
      }

      const templates: Record<'hydration' | 'eyes' | 'posture', Omit<TaskItem, 'id' | 'completed'>> = {
        hydration: {
          title: 'Hydration Check · Drink a full glass of water',
          dueTime: 'Today · Next 30 min',
          priority: 'medium',
          category: 'health',
          proactiveNote: 'Healthy Nova: Steady hydration improves focus and energy.',
        },
        eyes: {
          title: '20-20-20 Eye Break · Look 20ft away for 20s',
          dueTime: 'Today · Every 20 min',
          priority: 'medium',
          category: 'health',
          proactiveNote: 'Healthy Nova: Reduces digital eye strain during screen sessions.',
        },
        posture: {
          title: '2-Min Posture, Neck & Shoulder Stretch Reset',
          dueTime: 'Today · Right now',
          priority: 'medium',
          category: 'health',
          proactiveNote: 'Healthy Nova: Stand tall and roll shoulders back to release tension.',
        },
      };

      const tpl = templates[preset];
      const newTask: TaskItem = {
        ...tpl,
        id: `task-health-${nowMs}`,
        completed: false,
        updatedAtMs: nowMs,
      };
      setTasks((prev) => [newTask, ...prev]);
      queueSyncMutation('tasks', newTask.id, 'upsert', nowMs, newTask);
    },
    [queueSyncMutation]
  );

  const handleRefreshProactiveBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const res = await fetch('/api/nova/proactive-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: tasks.filter((t) => !t.completed),
          deviceState: device,
          localTime: new Date().toLocaleString(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.brief) {
        setProactiveBrief(data.brief);
      }
    } catch {
      // ignore
    } finally {
      setBriefLoading(false);
    }
  }, [device, tasks]);

  const handleClearPrivateVault = useCallback(() => {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    const fresh = createNewChatSession('Main Conversation', 'normal');
    fresh.messages = [
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        text: 'Private vault cleared. Ready whenever you need me.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    setMemories([]);
    setPendingMemorySuggestions([]);
    setSavedImages([]);
    setSavedPdfs([]);
    setTasks(INITIAL_TASKS);
    setAlarms(INITIAL_ALARMS);
    setAdaptedCodes(INITIAL_ADAPTED_CODES);
    setCommandKeys(INITIAL_COMMAND_KEYS);
    setMobileIndex(INITIAL_MOBILE_INDEX);
    setProjects([]);
    setActiveProjectId(null);
    setArtifacts([]);
    setSkills(BUILTIN_NOVA_SKILLS);
    setResearchReports([]);
    setWorkspaceFiles([]);
    setMultiAgentHistory([]);
  }, []);

  // Owner-only lock screen when enabled
  if (privacy.ownerLockEnabled && !ownerGatePassed) {
    return (
      <OwnerLockScreen
        ownerPin={privacy.ownerPin}
        onUnlockWithFingerprint={async () => {
          const res = await verifyFingerprint();
          if (res.ok) setOwnerGatePassed(true);
          return res.ok;
        }}
        onUnlockWithPin={() => setOwnerGatePassed(true)}
      />
    );
  }

  const orbStatusLabel =
    orbState === 'listening'
      ? 'Listening — speak in any language or slang'
      : orbState === 'thinking'
        ? effectiveOffline
          ? 'Processing locally on Nova Edge...'
          : 'Nova is thinking & checking your phone...'
        : orbState === 'speaking'
          ? 'Nova is speaking...'
          : orbState === 'scanning'
            ? 'Revolving security sweep in progress...'
            : effectiveOffline
              ? 'Offline Edge Ready · 100% Private'
              : 'Tap planet to talk · Hey Nova';

  const quickChips = [
    'Draw a glowing purple planet above neon obsidian mountains',
    'Create a PDF guide on daily focus & cybersecurity',
    'Auto-generate a quick passkey for morning focus and set 07:30 alarm',
    'Yo Nova, check my phone for any sketchy apps or viruses',
  ];

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'assistant', label: 'Assistant', icon: <Mic className="h-5 w-5" /> },
    { id: 'projects', label: 'Projects', icon: <FolderKanban className="h-5 w-5" /> },
    { id: 'studio', label: 'Studio', icon: <Sparkles className="h-5 w-5" /> },
    { id: 'research', label: 'Research', icon: <BookOpen className="h-5 w-5" /> },
    { id: 'controls', label: 'Controls', icon: <SlidersHorizontal className="h-5 w-5" /> },
  ];

  const workspaceNavSections: Array<{
    group: string;
    items: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: string }>;
  }> = [
    {
      group: 'Core',
      items: [
        { id: 'assistant', label: 'Assistant', icon: <Mic className="h-4 w-4" /> },
        {
          id: 'projects',
          label: 'Projects',
          icon: <FolderKanban className="h-4 w-4" />,
          badge: projects.length > 0 ? String(projects.length) : undefined,
        },
        { id: 'studio', label: 'Studio & Artifacts', icon: <Sparkles className="h-4 w-4" /> },
        {
          id: 'image_studio',
          label: 'Image Studio',
          icon: <ImageIcon className="h-4 w-4" />,
          badge: savedImages.length > 0 ? String(savedImages.length) : undefined,
        },
        {
          id: 'pdf_studio',
          label: 'PDF Studio',
          icon: <FileText className="h-4 w-4" />,
          badge: savedPdfs.length > 0 ? String(savedPdfs.length) : undefined,
        },
        { id: 'code', label: 'NOVA Code', icon: <Code2 className="h-4 w-4" /> },
      ],
    },
    {
      group: 'Intelligence',
      items: [
        {
          id: 'skills',
          label: 'Skills',
          icon: <Wand2 className="h-4 w-4" />,
          badge: String(skills.filter((s) => s.enabled).length),
        },
        { id: 'agents', label: 'Multi-Agent', icon: <Layers className="h-4 w-4" /> },
        { id: 'research', label: 'Deep Research', icon: <BookOpen className="h-4 w-4" /> },
        {
          id: 'memory',
          label: 'Memory Vault',
          icon: <Brain className="h-4 w-4" />,
          badge: String(memories.filter((m) => m.approved && m.active).length),
        },
        {
          id: 'learn_languages',
          label: 'Learn Languages',
          icon: <GraduationCap className="h-4 w-4" />,
        },
      ],
    },
    {
      group: 'Automation & Files',
      items: [
        { id: 'computer', label: 'Computer Use', icon: <Monitor className="h-4 w-4" /> },
        { id: 'connect', label: 'Connect & MCP', icon: <Server className="h-4 w-4" /> },
        {
          id: 'scheduler',
          label: 'Scheduler',
          icon: <CalendarClock className="h-4 w-4" />,
          badge:
            schedulerNotifs.filter((n) => !n.read).length > 0
              ? String(schedulerNotifs.filter((n) => !n.read).length)
              : undefined,
        },
        { id: 'files', label: 'File Workspace', icon: <FileSpreadsheet className="h-4 w-4" /> },
      ],
    },
    {
      group: 'Device & Governance',
      items: [
        { id: 'controls', label: 'Phone Controls', icon: <SlidersHorizontal className="h-4 w-4" /> },
        { id: 'search', label: 'Search Index', icon: <Search className="h-4 w-4" /> },
        { id: 'shield', label: 'Security Shield', icon: <Shield className="h-4 w-4" /> },
        { id: 'control', label: 'NOVA Control', icon: <Cpu className="h-4 w-4" /> },
      ],
    },
  ];

  const brightnessDimOpacity = Math.max(0, ((100 - device.brightness) / 100) * 0.45);

  const isDark = personalisation.theme === 'dark';

  return (
    <div className="relative min-h-screen bg-[#F6F5FB] text-slate-900 dark:bg-[#06040C] dark:text-[#F4F1FA] pb-20 lg:pb-6 transition-colors">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: isDark
            ? 'radial-gradient(circle at 50% 0%, rgba(109, 40, 217, 0.16) 0%, rgba(11, 7, 20, 0.4) 45%, #06040C 100%)'
            : 'radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.10) 0%, rgba(246, 245, 251, 0.6) 50%, #F6F5FB 100%)',
        }}
      />

      <div
        className="pointer-events-none fixed inset-0 z-40 bg-black transition-opacity duration-200"
        style={{ opacity: brightnessDimOpacity }}
        aria-hidden="true"
      />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-violet-500/15 dark:border-violet-400/12 bg-white/90 dark:bg-[#06040C]/88 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileModulesOpen(true)}
              aria-label="Open all NOVA modules"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 dark:border-violet-400/25 bg-slate-100 dark:bg-[#120D1F] text-slate-700 dark:text-violet-200 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDesktopNavCollapsed((c) => !c)}
              aria-label="Toggle workspace navigation sidebar"
              className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#120D1F] text-slate-700 dark:text-slate-300 hover:border-violet-400"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assistant')}
              className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-lg"
            >
              <img
                src="/assets/aistudio/nova-logo-transparent_5434d2c2.png"
                alt="Nova"
                referrerPolicy="no-referrer"
                className={`h-8 w-8 object-contain ${orbState !== 'idle' ? 'nova-core-breathe' : ''}`}
              />
              <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Nova
              </span>
            </button>
            {activeProject && (
              <button
                type="button"
                onClick={() => setActiveTab('projects')}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-violet-400/35 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-200"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                <span className="max-w-[140px] truncate">{activeProject.name}</span>
              </button>
            )}
          </div>

          <nav className="hidden lg:flex items-center gap-5" aria-label="Primary Quick Links">
            {[
              { id: 'assistant' as NavTab, label: 'Assistant' },
              { id: 'projects' as NavTab, label: 'Projects' },
              { id: 'studio' as NavTab, label: 'Studio' },
              { id: 'code' as NavTab, label: 'Code' },
              { id: 'research' as NavTab, label: 'Research' },
              { id: 'agents' as NavTab, label: 'Agents' },
              { id: 'learn_languages' as NavTab, label: 'Learn Languages' },
              { id: 'control' as NavTab, label: 'Control' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'text-slate-950 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
                {activeTab === item.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-violet-500" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setPersonalisation((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))
              }
              aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 dark:border-violet-400/25 bg-slate-100 dark:bg-[#120D1F] text-slate-700 dark:text-violet-200 hover:bg-violet-500/15 transition-colors shrink-0"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                if (isUnlocked) {
                  lockNow();
                } else {
                  requestBiometricFor('Unlock sensitive phone controls & private vault');
                }
              }}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isUnlocked
                  ? 'border border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/20'
                  : 'border border-violet-500/25 dark:border-violet-400/25 bg-slate-100 dark:bg-[#120D1F] text-violet-700 dark:text-violet-200 hover:bg-violet-500/15'
              }`}
            >
              {isUnlocked ? (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Unlocked</span>
                </>
              ) : (
                <>
                  <Fingerprint className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                  <span className="hidden sm:inline">Owner Lock</span>
                </>
              )}
            </button>
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Shell Body: Collapsible Desktop Workspace Sidebar + Main Panel */}
      <div className="relative z-10 mx-auto flex max-w-[1480px]">
        {!desktopNavCollapsed && (
          <aside
            aria-label="Workspace Modules Sidebar"
            className="hidden lg:block w-56 shrink-0 border-r border-violet-500/12 dark:border-white/8 bg-white/60 dark:bg-[#090612]/70 px-3 py-4 min-h-[calc(100vh-3.5rem)]"
          >
            <div className="space-y-5">
              {workspaceNavSections.map((sec) => (
                <div key={sec.group}>
                  <div className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {sec.group}
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {sec.items.map((item) => {
                      const active = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
                            active
                              ? 'bg-violet-600 text-white'
                              : 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            {item.icon}
                            <span className="truncate">{item.label}</span>
                          </span>
                          {item.badge && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                                active
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-200/80 text-slate-700 dark:bg-white/10 dark:text-slate-300'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

      {/* Main Content */}
      <main className="flex-1 min-w-0 px-4 py-5 sm:px-6 lg:py-6">
        {activeTab === 'assistant' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-8 flex flex-col rounded-3xl border border-violet-500/15 dark:border-violet-400/12 bg-white/95 dark:bg-[#0D0917]/90 shadow-sm overflow-hidden">
              {/* Top Workspace Control Strip inside Assistant Card */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/8 px-4 py-2.5 sm:px-6 bg-slate-50/80 dark:bg-[#110C1E]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="flex min-h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171127] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-violet-400 transition-colors"
                  >
                    <PanelLeft className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                    <span>Chats ({sessions.length})</span>
                  </button>

                  <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171127] p-0.5">
                    <button
                      type="button"
                      onClick={() => setAssistantView('chat')}
                      className={`min-h-[30px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                        assistantView === 'chat'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssistantView('agent')}
                      className={`flex min-h-[30px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                        assistantView === 'agent'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Bot className="h-3 w-3" />
                      <span>Agent</span>
                    </button>
                  </div>

                  <select
                    value={aiMode}
                    onChange={(e) =>
                      updateSessionById(activeSession.id, (s) => ({
                        ...s,
                        mode: e.target.value as NovaAIMode,
                      }))
                    }
                    aria-label="NOVA AI Mode"
                    className="min-h-[34px] rounded-xl border border-violet-400/35 bg-white dark:bg-[#171127] px-2.5 text-xs font-semibold text-violet-700 dark:text-violet-200 focus:border-violet-400 focus:outline-none"
                  >
                    {NOVA_AI_MODE_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {assistantView === 'chat' && messages.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => void handleSummarizeSession(activeSession.id)}
                      disabled={summarizingId === activeSession.id || effectiveOffline}
                      className="flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171127] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-violet-400 disabled:opacity-45"
                    >
                      <Sparkles
                        className={`h-3.5 w-3.5 text-violet-600 dark:text-violet-300 ${
                          summarizingId === activeSession.id ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Summarize</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceHubTab('memories');
                      setWorkspaceHubOpen(true);
                    }}
                    className="flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171127] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-violet-400"
                  >
                    <Brain className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                    <span className="hidden sm:inline">
                      Memory ({memories.filter((m) => m.approved && m.active).length})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceHubTab('personalise');
                      setWorkspaceHubOpen(true);
                    }}
                    className="flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171127] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-violet-400"
                  >
                    <Sliders className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                    <span className="hidden sm:inline">Personalise</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceHubTab('models');
                      setWorkspaceHubOpen(true);
                    }}
                    className="flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171127] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-violet-400"
                  >
                    <Cpu className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                    <span className="hidden sm:inline">Models</span>
                  </button>
                </div>
              </div>

              {/* Active Project Isolation Strip & Session Summary Banner */}
              {activeProject && (
                <div className="flex items-center justify-between gap-2 border-b border-violet-500/15 bg-violet-50/80 dark:bg-violet-950/35 px-4 py-2 text-xs text-violet-800 dark:text-violet-200 sm:px-6">
                  <span className="truncate">
                    <strong className="font-semibold">Project Context:</strong> {activeProject.name} ({activeProject.documents.length} doc(s))
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveProjectId(null)}
                    className="shrink-0 font-semibold text-violet-700 hover:underline dark:text-violet-300"
                  >
                    Exit Project
                  </button>
                </div>
              )}

              {/* Session Summary Banner when present */}
              {assistantView === 'chat' && activeSession.summary && (
                <div className="border-b border-violet-500/10 bg-violet-50/70 dark:bg-violet-950/25 px-4 py-2 text-xs text-violet-800 dark:text-violet-200 sm:px-6">
                  <span className="font-semibold">Summary:</span> {activeSession.summary}
                </div>
              )}

              {assistantView === 'agent' ? (
                <div className="p-4 sm:p-6">
                  <AgentRunnerPanel
                    plan={agentPlan}
                    isOffline={effectiveOffline}
                    onStartObjective={(obj) => void handleStartAgentObjective(obj)}
                    onApproveStep={handleApproveAgentStep}
                    onSkipStep={handleSkipAgentStep}
                    onRetryStep={handleRetryAgentStep}
                    onCancelPlan={() => setAgentPlan(null)}
                  />
                </div>
              ) : (
                <>
                  {/* Revolving Planet Core + Engine & Voice Strip */}
                  <div className="border-b border-slate-200 dark:border-white/8 px-4 pt-4 pb-4 sm:px-6">
                    <NovaCoreOrb
                      orbState={orbState}
                      onToggleListen={() => void toggleListening()}
                      statusLabel={orbStatusLabel}
                    />

                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      <select
                        value={reasoningMode}
                        onChange={(e) => setReasoningMode(e.target.value as IntelligenceMode)}
                        aria-label="Nova Intelligence Engine"
                        className="min-h-[38px] rounded-xl border border-violet-400/30 bg-slate-100 dark:bg-[#161026] px-3 text-xs font-medium text-violet-700 dark:text-violet-200 focus:border-violet-400 focus:outline-none"
                      >
                        <option value="fast">Nova HyperFast (Gemini 4 + Search)</option>
                        <option value="turbo">Nova Instant Turbo (Flash-Lite)</option>
                        <option value="deep">Gemini 4 Max Accuracy (XHigh)</option>
                        <option value="offline">Offline Edge (Zero Cloud)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => setSlangMirroring((v) => !v)}
                        className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          slangMirroring
                            ? 'bg-violet-600/15 dark:bg-violet-600/25 text-violet-700 dark:text-violet-200 border border-violet-400/35'
                            : 'bg-slate-100 dark:bg-[#161026] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/8'
                        }`}
                      >
                        Slang Mirror: {slangMirroring ? 'On' : 'Off'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPrivacy((p) => ({ ...p, incognitoMode: !p.incognitoMode }))
                        }
                        className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          privacy.incognitoMode
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-200 border border-amber-400/35'
                            : 'bg-slate-100 dark:bg-[#161026] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/8'
                        }`}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>Incognito: {privacy.incognitoMode ? 'On' : 'Off'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVoiceReply((v) => !v)}
                        className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          voiceReply
                            ? 'bg-violet-600/15 dark:bg-violet-600/25 text-violet-700 dark:text-violet-200 border border-violet-400/35'
                            : 'bg-slate-100 dark:bg-[#161026] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/8'
                        }`}
                      >
                        {voiceReply ? (
                          <Volume2 className="h-3.5 w-3.5" />
                        ) : (
                          <VolumeX className="h-3.5 w-3.5" />
                        )}
                        <span>Voice: {voiceReply ? voiceName : 'Off'}</span>
                      </button>

                      {voiceReply && (
                        <select
                          value={voiceName}
                          onChange={(e) =>
                            setVoiceName(e.target.value as 'Kore' | 'Zephyr' | 'Puck')
                          }
                          aria-label="Nova voice persona"
                          className="min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#161026] px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:border-violet-400 focus:outline-none"
                        >
                          <option value="Kore">Kore</option>
                          <option value="Zephyr">Zephyr</option>
                          <option value="Puck">Puck</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Conversation Thread with Markdown, Edit, Regenerate, Copy, Speak & PDF */}
                  <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6 max-h-[420px] sm:max-h-[470px]">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          msg.role === 'user' ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-[92%] sm:max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-violet-600 text-white'
                              : 'border border-slate-200 dark:border-violet-400/15 bg-slate-50 dark:bg-[#161026] text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                            <div className="mb-1.5 text-[11px] opacity-80">
                              Attached: {msg.attachmentNames.join(', ')}
                            </div>
                          )}

                          {editingMessageId === msg.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveEditedUserMessage(msg.id);
                              }}
                              className="space-y-2 min-w-[220px]"
                            >
                              <textarea
                                rows={3}
                                value={editingDraft}
                                onChange={(e) => setEditingDraft(e.target.value)}
                                className="w-full rounded-xl bg-white/15 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/40"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingMessageId(null)}
                                  className="rounded-lg bg-black/20 px-2.5 py-1 text-xs text-white/85 hover:bg-black/30"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                                >
                                  Save &amp; Re-run
                                </button>
                              </div>
                            </form>
                          ) : msg.streaming && !msg.text ? (
                            <NovaMiniPlanetLoader label="Nova is thinking..." />
                          ) : (
                            <>
                              <MarkdownRenderer
                                content={msg.text}
                                inverted={msg.role === 'user'}
                              />
                              {msg.streaming && (
                                <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-white/10">
                                  <NovaMiniPlanetLoader label="Streaming reply..." />
                                </div>
                              )}
                            </>
                          )}

                          {/* Inline Generated AI Picture */}
                          {msg.generatedImageUrl && (
                            <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black/30">
                              <img
                                src={msg.generatedImageUrl}
                                alt="Generated by Nova"
                                referrerPolicy="no-referrer"
                                className="w-full max-h-72 object-cover"
                              />
                              <div className="flex items-center justify-between px-3 py-2 text-xs bg-black/60 text-white">
                                <span className="text-slate-200">Saved to Studio Gallery</span>
                                <a
                                  href={msg.generatedImageUrl}
                                  download={`nova-picture-${msg.id}.png`}
                                  className="flex items-center gap-1 font-semibold text-violet-300 hover:text-white"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  <span>Download PNG</span>
                                </a>
                              </div>
                            </div>
                          )}

                          {/* Inline Generated PDF Card */}
                          {msg.generatedPdf && (
                            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-violet-400/25 bg-white dark:bg-[#120D1F] p-3">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {msg.generatedPdf.title}.pdf
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                  {msg.generatedPdf.pageCount} page(s) · Ready to download or edit
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadBase64Pdf(
                                      msg.generatedPdf!.base64Data,
                                      msg.generatedPdf!.title
                                    )
                                  }
                                  className="flex min-h-[34px] items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-xs font-semibold text-white hover:bg-violet-500"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  <span>PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('studio')}
                                  className="min-h-[34px] rounded-lg border border-slate-200 dark:border-white/15 px-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Executed Tool Actions */}
                          {msg.actions && msg.actions.length > 0 && (
                            <div className="mt-2.5 space-y-1.5 border-t border-slate-200 dark:border-white/10 pt-2">
                              {msg.actions.map((act, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-200"
                                >
                                  {act.requiresBiometric && !isUnlocked ? (
                                    <Lock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300 shrink-0" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                                  )}
                                  <span>{act.resultText}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Grounded Web Sources */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-2 border-t border-slate-200 dark:border-white/10 pt-2">
                              {msg.sources.slice(0, 3).map((src, i) => (
                                <a
                                  key={i}
                                  href={src.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-300 underline decoration-violet-400/40 hover:opacity-80"
                                >
                                  <span className="truncate max-w-[180px]">{src.title}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Message Action Bar: Copy + Edit / Regenerate + Speak + PDF */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 px-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>
                            {msg.role === 'user' ? 'You' : 'Nova'} · {msg.timestamp}
                            {msg.modeUsed && msg.modeUsed !== 'normal' ? ` · ${msg.modeUsed}` : ''}
                            {msg.modelUsed ? ` · ${msg.modelUsed}` : ''}
                            {msg.offlineProcessed ? ' · Offline Edge' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, msg.text)}
                            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                            aria-label="Copy message text"
                          >
                            {copiedMsgId === msg.id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-500 dark:text-emerald-300" />
                                <span className="text-emerald-600 dark:text-emerald-300">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          {msg.role === 'user' && editingMessageId !== msg.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditingDraft(msg.text);
                              }}
                              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          )}

                          {msg.role === 'assistant' && !msg.streaming && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRegenerateResponse(msg.id)}
                                className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Regenerate</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void speakResponse(msg.text, true)}
                                className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                              >
                                <Volume2 className="h-3 w-3" />
                                <span>Speak</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const pdf = createFormattedPdf({
                                    title: `Nova_Note_${msg.id.slice(-4)}`,
                                    subtitle: 'Saved from Nova Chat',
                                    sections: [
                                      {
                                        heading: 'Assistant Response',
                                        paragraphs: msg.text.split('\n\n'),
                                      },
                                    ],
                                  });
                                  setSavedPdfs((prev) => [pdf, ...prev]);
                                  downloadBase64Pdf(pdf.base64Data, pdf.title);
                                }}
                                className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                              >
                                <FilePlus2 className="h-3 w-3" />
                                <span>PDF</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Pending User-Approved Memory Suggestion Banner */}
                  {pendingMemorySuggestions.length > 0 && (
                    <div className="mx-4 mb-3 space-y-2 rounded-2xl border border-violet-400/35 bg-violet-50 dark:bg-violet-950/35 p-3 text-xs sm:mx-6">
                      {pendingMemorySuggestions.map((sug) => (
                        <div
                          key={sug.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 text-slate-800 dark:text-violet-100">
                            <Brain className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" />
                            <span>
                              <strong>Save memory?</strong> &ldquo;{sug.content}&rdquo; (
                              {sug.category})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const nowMs = Date.now();
                                setMemories((prev) => [
                                  {
                                    id: `mem-${nowMs}`,
                                    content: sug.content,
                                    category: sug.category,
                                    scope: activeProject ? 'project' : 'general',
                                    ...(activeProject ? { projectId: activeProject.id } : {}),
                                    approved: true,
                                    active: true,
                                    createdAt: new Date().toLocaleDateString(),
                                    updatedAtMs: nowMs,
                                  },
                                  ...prev,
                                ]);
                                setPendingMemorySuggestions((prev) =>
                                  prev.filter((p) => p.id !== sug.id)
                                );
                              }}
                              className="min-h-[30px] rounded-lg bg-violet-600 px-3 font-semibold text-white hover:bg-violet-500"
                            >
                              Approve &amp; Save
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingMemorySuggestions((prev) =>
                                  prev.filter((p) => p.id !== sug.id)
                                )
                              }
                              className="min-h-[30px] rounded-lg border border-slate-300 dark:border-white/15 px-2.5 text-slate-600 dark:text-slate-300"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {errorBanner && (
                    <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200 sm:mx-6">
                      <span>{errorBanner}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {messages.some((m) => m.role === 'user') && (
                          <button
                            type="button"
                            onClick={() => {
                              const lastUser = [...messages]
                                .reverse()
                                .find((m) => m.role === 'user');
                              if (lastUser) void sendMessageToNova(lastUser.text);
                            }}
                            className="rounded-lg bg-rose-500/20 px-2.5 py-1 font-medium hover:bg-rose-500/35"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setErrorBanner(null)}
                          className="rounded-lg px-2 py-1 opacity-75 hover:opacity-100"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Quick Suggestions */}
                  <div className="flex items-center gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
                    {quickChips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => void sendMessageToNova(chip)}
                        className="shrink-0 rounded-xl border border-violet-400/25 bg-slate-50 dark:bg-[#151023] px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:border-violet-400/55 hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  {/* Pending Attachments Bar */}
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#120D1F] px-4 py-2 text-xs">
                      {attachments.map((att) => (
                        <span
                          key={att.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-100 dark:bg-[#1A132C] px-2.5 py-1 text-violet-800 dark:text-violet-200"
                        >
                          <span className="truncate max-w-[140px]">{att.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                            }
                            aria-label={`Remove ${att.name}`}
                            className="opacity-70 hover:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Multimodal Voice + File/Video + Text Composer */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendMessageToNova(inputText);
                    }}
                    className="flex items-center gap-2 border-t border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#100B1C] p-3 sm:p-4"
                  >
                    <input
                      ref={chatAttachRef}
                      type="file"
                      accept="image/*,application/pdf,text/*,audio/*,video/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          void handleAttachFiles(e.target.files);
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => chatAttachRef.current?.click()}
                      aria-label="Attach image, PDF, video, audio, or file"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-[#19122B] border border-slate-200 dark:border-transparent text-slate-700 dark:text-slate-300 hover:bg-violet-600/15 dark:hover:bg-violet-600/25 transition-colors"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleListening()}
                      aria-label={orbState === 'listening' ? 'Stop voice input' : 'Start voice input'}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        orbState === 'listening'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white dark:bg-[#19122B] border border-slate-200 dark:border-transparent text-violet-600 dark:text-violet-300 hover:bg-violet-600/15 dark:hover:bg-violet-600/25'
                      }`}
                    >
                      {orbState === 'listening' ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </button>
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Ask anything, attach video/PDF/image, draw art, or issue commands..."
                      className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171127] px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-violet-400 focus:outline-none"
                    />
                    {orbState === 'thinking' ? (
                      <button
                        type="button"
                        onClick={stopGeneration}
                        aria-label="Stop generating"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white hover:bg-rose-500 transition-colors"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!inputText.trim() && attachments.length === 0}
                        aria-label="Send message to Nova"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-45 transition-colors"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                  </form>
                </>
              )}
            </section>

            {/* Right Companion Dock */}
            <aside className="lg:col-span-4 space-y-5">
              <div className="rounded-2xl border border-violet-500/15 dark:border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Phone Controls
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('controls')}
                    className="text-xs font-medium text-violet-600 dark:text-violet-300 hover:underline"
                  >
                    Open all
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      key: 'wifi' as const,
                      label: 'Wi-Fi',
                      val: device.wifi,
                      icon: <Wifi className="h-4 w-4" />,
                    },
                    {
                      key: 'bluetooth' as const,
                      label: 'Bluetooth',
                      val: device.bluetooth,
                      icon: <Bluetooth className="h-4 w-4" />,
                    },
                    {
                      key: 'dnd' as const,
                      label: 'Do Not Disturb',
                      val: device.dnd,
                      icon: <Moon className="h-4 w-4" />,
                    },
                    {
                      key: 'flashlight' as const,
                      label: 'Flashlight',
                      val: device.flashlight,
                      icon: <Flashlight className="h-4 w-4" />,
                    },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => void handleToggleSetting(item.key)}
                      className={`flex min-h-[48px] items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                        item.val
                          ? 'border-violet-500/45 bg-violet-600/15 dark:bg-violet-600/20 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                  <span>Alarms: {alarms.filter((a) => a.enabled).length} active</span>
                  <span>Adapted Codes: {adaptedCodes.length}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-violet-500/15 dark:border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Studio &amp; Private Vault
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('studio')}
                    className="text-xs font-medium text-violet-600 dark:text-violet-300 hover:underline"
                  >
                    Open Studio
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab('studio')}
                    className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] p-3 text-left hover:border-violet-400/45"
                  >
                    <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                      {savedImages.length} Pictures
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">AI Art Studio</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('studio')}
                    className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] p-3 text-left hover:border-violet-400/45"
                  >
                    <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                      {savedPdfs.length} PDFs
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Create &amp; Edit
                    </div>
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-violet-500/15 dark:border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Security &amp; Privacy
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      {securityAudits.filter((a) => a.status === 'flagged').length} flagged ·{' '}
                      {privacy.ownerLockEnabled ? 'Owner Lock On' : 'Private Vault'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('shield');
                      handleStartScan();
                    }}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600/15 dark:bg-violet-600/25 border border-violet-400/35 px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-600/25 transition-colors"
                  >
                    <ScanSearch className="h-3.5 w-3.5" />
                    <span>Scan</span>
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {activeTab === 'projects' && (
          <ProjectsModule
            projects={projects}
            activeProjectId={activeProjectId}
            sessions={sessions}
            onSelectActiveProject={(pid) => setActiveProjectId(pid)}
            onCreateProject={({ name, description, instructions }) => {
              const nowMs = Date.now();
              const created: NovaProject = {
                id: `proj-${nowMs}`,
                name,
                description,
                instructions,
                archived: false,
                folders: ['General'],
                documents: [],
                activity: [
                  {
                    id: `act-${nowMs}`,
                    action: 'Created project',
                    detail: name,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  },
                ],
                createdAt: new Date().toLocaleDateString(),
                updatedAtMs: nowMs,
              };
              setProjects((prev) => [created, ...prev]);
              setActiveProjectId(created.id);
            }}
            onUpdateProject={(id, next) =>
              setProjects((prev) =>
                prev.map((p) => (p.id === id ? { ...p, ...next, updatedAtMs: Date.now() } : p))
              )
            }
            onDeleteProject={(id) => {
              setProjects((prev) => prev.filter((p) => p.id !== id));
              if (activeProjectId === id) setActiveProjectId(null);
            }}
            onOpenProjectChat={(projectId, existingSessionId) => {
              setActiveProjectId(projectId);
              if (existingSessionId) {
                setActiveSessionId(existingSessionId);
              } else {
                const proj = projects.find((p) => p.id === projectId);
                const fresh = createNewChatSession(
                  proj ? `${proj.name} Session` : 'Project Chat',
                  activeSession.mode
                );
                fresh.projectId = projectId;
                setSessions((prev) => [fresh, ...prev]);
                setActiveSessionId(fresh.id);
              }
              setAssistantView('chat');
              setActiveTab('assistant');
            }}
          />
        )}

        {activeTab === 'studio' && (
          <StudioPanel
            reasoningMode={reasoningMode}
            preferredModel={preferredModel}
            isOffline={effectiveOffline}
            savedImages={savedImages}
            savedPdfs={savedPdfs}
            artifacts={artifacts}
            activeProject={activeProject}
            onOpenApiSettings={() => {
              setWorkspaceHubTab('models');
              setWorkspaceHubOpen(true);
            }}
            onSaveArtifact={(art) =>
              setArtifacts((prev) => {
                const exists = prev.some((a) => a.id === art.id);
                return exists ? prev.map((a) => (a.id === art.id ? art : a)) : [art, ...prev];
              })
            }
            onDeleteArtifact={(id) => setArtifacts((prev) => prev.filter((a) => a.id !== id))}
            onSaveImage={(img) => setSavedImages((prev) => [img, ...prev])}
            onDeleteImage={(id) =>
              setSavedImages((prev) => prev.filter((item) => item.id !== id))
            }
            onSavePdf={(pdf) =>
              setSavedPdfs((prev) => {
                const exists = prev.some((p) => p.id === pdf.id);
                return exists ? prev.map((p) => (p.id === pdf.id ? pdf : p)) : [pdf, ...prev];
              })
            }
            onDeletePdf={(id) => setSavedPdfs((prev) => prev.filter((item) => item.id !== id))}
            onIndexCreatedItem={(item) => {
              const nowMs = Date.now();
              const created: MobileIndexItem = {
                id: `idx-${nowMs}`,
                ...item,
                updatedAt: 'Created just now',
                updatedAtMs: nowMs,
              };
              setMobileIndex((prev) => [created, ...prev]);
              queueSyncMutation('indexedFiles', created.id, 'upsert', nowMs, created);
            }}
          />
        )}

        {activeTab === 'image_studio' && (
          <ImageStudioModule
            isOffline={effectiveOffline}
            savedImages={savedImages}
            onSaveImage={(img) => setSavedImages((prev) => [img, ...prev])}
            onDeleteImage={(id) =>
              setSavedImages((prev) => prev.filter((item) => item.id !== id))
            }
            onOpenApiSettings={() => {
              setWorkspaceHubTab('models');
              setWorkspaceHubOpen(true);
            }}
            onSendImageToPdf={(payload) => {
              setStagedPdfMedia(payload);
              setActiveTab('pdf_studio');
            }}
            onIndexCreatedItem={(item) => {
              const nowMs = Date.now();
              const created: MobileIndexItem = {
                id: `idx-${nowMs}`,
                ...item,
                updatedAt: 'Created just now',
                updatedAtMs: nowMs,
              };
              setMobileIndex((prev) => [created, ...prev]);
              queueSyncMutation('indexedFiles', created.id, 'upsert', nowMs, created);
            }}
          />
        )}

        {activeTab === 'pdf_studio' && (
          <PdfStudioModule
            isOffline={effectiveOffline}
            savedImages={savedImages}
            savedPdfs={savedPdfs}
            stagedMedia={stagedPdfMedia}
            onClearStagedMedia={() => setStagedPdfMedia(null)}
            onOpenImageStudio={() => setActiveTab('image_studio')}
            onSavePdf={(pdf) =>
              setSavedPdfs((prev) => {
                const exists = prev.some((p) => p.id === pdf.id);
                return exists ? prev.map((p) => (p.id === pdf.id ? pdf : p)) : [pdf, ...prev];
              })
            }
            onDeletePdf={(id) => setSavedPdfs((prev) => prev.filter((item) => item.id !== id))}
            onIndexCreatedItem={(item) => {
              const nowMs = Date.now();
              const created: MobileIndexItem = {
                id: `idx-${nowMs}`,
                ...item,
                updatedAt: 'Created just now',
                updatedAtMs: nowMs,
              };
              setMobileIndex((prev) => [created, ...prev]);
              queueSyncMutation('indexedFiles', created.id, 'upsert', nowMs, created);
            }}
          />
        )}

        {activeTab === 'code' && <CodeAgentModule isOffline={effectiveOffline} />}

        {activeTab === 'skills' && (
          <SkillsModule
            skills={skills}
            onSaveSkill={(sk) =>
              setSkills((prev) => {
                const exists = prev.some((item) => item.id === sk.id);
                return exists ? prev.map((item) => (item.id === sk.id ? sk : item)) : [sk, ...prev];
              })
            }
            onDeleteSkill={(id) => setSkills((prev) => prev.filter((s) => s.id !== id))}
            onImportSkills={(imported) =>
              setSkills((prev) => {
                const ids = new Set(prev.map((s) => s.id));
                const additions = imported.filter((s) => !ids.has(s.id));
                return [...additions, ...prev];
              })
            }
          />
        )}

        {activeTab === 'agents' && (
          <MultiAgentModule
            activeProject={activeProject}
            history={multiAgentHistory}
            onSaveRun={(run) => setMultiAgentHistory((prev) => [run, ...prev.slice(0, 14)])}
          />
        )}

        {activeTab === 'computer' && <ComputerUseModule />}

        {activeTab === 'research' && (
          <ResearchModule
            activeProject={activeProject}
            reports={researchReports}
            onSaveReport={(rep) => setResearchReports((prev) => [rep, ...prev.slice(0, 19)])}
          />
        )}

        {activeTab === 'connect' && <ConnectModule />}

        {activeTab === 'scheduler' && (
          <SchedulerModule onNotificationsChange={(items) => setSchedulerNotifs(items)} />
        )}

        {activeTab === 'memory' && (
          <MemoryModule
            memories={memories}
            activeProject={activeProject}
            activeSession={activeSession}
            onAddMemory={(content, category, scope) => {
              const nowMs = Date.now();
              setMemories((prev) => [
                {
                  id: `mem-${nowMs}`,
                  content,
                  category,
                  scope,
                  ...(scope === 'project' && activeProject ? { projectId: activeProject.id } : {}),
                  approved: true,
                  active: true,
                  createdAt: new Date().toLocaleDateString(),
                  updatedAtMs: nowMs,
                },
                ...prev,
              ]);
            }}
            onUpdateMemory={(id, patch) =>
              setMemories((prev) =>
                prev.map((m) => (m.id === id ? { ...m, ...patch, updatedAtMs: Date.now() } : m))
              )
            }
            onDeleteMemory={(id) => setMemories((prev) => prev.filter((m) => m.id !== id))}
            onClearScopeMemories={(scope) => {
              setMemories((prev) =>
                prev.filter((m) => {
                  const mScope = m.scope || (m.projectId ? 'project' : 'general');
                  if (scope === 'general') return mScope !== 'general';
                  return !(mScope === 'project' && m.projectId === activeProject?.id);
                })
              );
            }}
            onSummarizeActiveSession={() => handleSummarizeSession(activeSession.id)}
          />
        )}

        {activeTab === 'files' && (
          <FileWorkspaceModule
            activeProject={activeProject}
            files={workspaceFiles}
            onSaveFile={(file) =>
              setWorkspaceFiles((prev) => {
                const exists = prev.some((f) => f.id === file.id);
                return exists ? prev.map((f) => (f.id === file.id ? file : f)) : [file, ...prev];
              })
            }
            onDeleteFile={(id) => setWorkspaceFiles((prev) => prev.filter((f) => f.id !== id))}
          />
        )}

        {activeTab === 'control' && <ControlGovernanceModule />}

        {activeTab === 'learn_languages' && (
          <LearnLanguagesModule cloudUser={cloudUser} isOffline={effectiveOffline} />
        )}

        {activeTab === 'controls' && (
          <ControlsPanel
            device={device}
            tasks={tasks}
            alarms={alarms}
            adaptedCodes={adaptedCodes}
            commandKeys={commandKeys}
            biometrics={biometrics}
            isUnlocked={isUnlocked}
            proactiveBrief={proactiveBrief}
            briefLoading={briefLoading}
            onToggleSetting={(key, bio) => void handleToggleSetting(key, bio)}
            onChangeSlider={(key, val) => setDevice((prev) => ({ ...prev, [key]: val }))}
            onMediaToggle={() =>
              setDevice((prev) => ({
                ...prev,
                activeMedia: { ...prev.activeMedia, playing: !prev.activeMedia.playing },
              }))
            }
            onMediaNext={() =>
              setDevice((prev) => {
                const idx = MEDIA_TRACKS.findIndex((t) => t.title === prev.activeMedia.title);
                const next = MEDIA_TRACKS[(idx + 1) % MEDIA_TRACKS.length];
                return { ...prev, activeMedia: { ...next, playing: true } };
              })
            }
            onAddTask={(newTask) => {
              const nowMs = Date.now();
              const created: TaskItem = {
                ...newTask,
                id: `task-${nowMs}`,
                completed: false,
                updatedAtMs: nowMs,
              };
              setTasks((prev) => [created, ...prev]);
              queueSyncMutation('tasks', created.id, 'upsert', nowMs, created);
            }}
            onToggleTask={(id) => {
              const nowMs = Date.now();
              setTasks((prev) =>
                prev.map((t) => {
                  if (t.id !== id) return t;
                  const updated = { ...t, completed: !t.completed, updatedAtMs: nowMs };
                  queueSyncMutation('tasks', updated.id, 'upsert', nowMs, updated);
                  return updated;
                })
              );
            }}
            onDeleteTask={(id) => {
              const nowMs = Date.now();
              setTasks((prev) => prev.filter((t) => t.id !== id));
              queueSyncMutation('tasks', id, 'delete', nowMs);
            }}
            onAddAlarm={(al) => {
              const nowMs = Date.now();
              const created: AlarmItem = {
                ...al,
                id: `alarm-${nowMs}`,
                updatedAtMs: nowMs,
              };
              setAlarms((prev) => [created, ...prev]);
              queueSyncMutation('alarms', created.id, 'upsert', nowMs, created);
            }}
            onToggleAlarm={(id) => {
              const nowMs = Date.now();
              setAlarms((prev) =>
                prev.map((a) => {
                  if (a.id !== id) return a;
                  const updated = { ...a, enabled: !a.enabled, updatedAtMs: nowMs };
                  queueSyncMutation('alarms', updated.id, 'upsert', nowMs, updated);
                  return updated;
                })
              );
            }}
            onDeleteAlarm={(id) => {
              const nowMs = Date.now();
              setAlarms((prev) => prev.filter((a) => a.id !== id));
              queueSyncMutation('alarms', id, 'delete', nowMs);
            }}
            onRunAdaptedCode={(c) => void sendMessageToNova(c.code)}
            onDeleteAdaptedCode={(id) =>
              setAdaptedCodes((prev) => prev.filter((c) => c.id !== id))
            }
            onCreateCommandKey={({ label, commandPrompt, operationType }) => {
              const newKey: QuickCommandKey = {
                id: `qkey-${Date.now()}`,
                passkey: generateLocalCommandPasskey(),
                label,
                commandPrompt,
                operationType,
                createdAt: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              };
              setCommandKeys((prev) => [newKey, ...prev]);
            }}
            onRunCommandKey={(k) => {
              setActiveTab('assistant');
              void sendMessageToNova(k.passkey);
            }}
            onDeleteCommandKey={(id) =>
              setCommandKeys((prev) => prev.filter((k) => k.id !== id))
            }
            onRunExpressOp={(op) => {
              if (op === 'focus') {
                void handleToggleSetting('dnd', false, true);
                setDevice((prev) => ({ ...prev, brightness: 45 }));
              } else if (op === 'privacy') {
                void handleToggleSetting('autoSync', false, false);
                void handleToggleSetting('location', true, false);
                handleStartScan();
              } else if (op === 'pdf') {
                setActiveTab('assistant');
                void sendMessageToNova('Create a concise PDF brief of my active tasks and privacy checklist');
              } else if (op === 'wallpaper') {
                setActiveTab('assistant');
                void sendMessageToNova('Draw a glowing purple planet wallpaper above obsidian neon ridges');
              }
            }}
            cloudUser={cloudUser}
            syncState={syncState}
            onSignInCloud={() => void signInWithGoogle()}
            onSignOutCloud={() => void signOutCloud()}
            onSyncNow={() => void reconcileNow()}
            onActivateHealthyNova={handleActivateHealthyNova}
            onRequestUnlock={(reason) => requestBiometricFor(reason)}
            onLockNow={lockNow}
            onRefreshBrief={() => void handleRefreshProactiveBrief()}
          />
        )}

        {activeTab === 'search' && (
          <SearchPanel
            mobileIndex={mobileIndex}
            onIndexLocalFiles={(files) => void handleIndexLocalFiles(files)}
            onAskNovaAboutItem={(prompt) => {
              setActiveTab('assistant');
              void sendMessageToNova(prompt);
            }}
          />
        )}

        {activeTab === 'shield' && (
          <SecurityShieldPanel
            audits={securityAudits}
            isScanning={isScanning}
            lastScanAt={lastScanAt}
            isUnlocked={isUnlocked}
            privacy={privacy}
            onUpdatePrivacy={(next) => setPrivacy((prev) => ({ ...prev, ...next }))}
            onClearPrivateVault={handleClearPrivateVault}
            onStartScan={handleStartScan}
            onQuarantineApp={handleQuarantineApp}
            onTrustApp={handleTrustApp}
            onRequestUnlock={(reason) => requestBiometricFor(reason)}
          />
        )}
      </main>
      </div>

      {/* Mobile Ecosystem Modules Drawer */}
      {mobileModulesOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden bg-black/60 backdrop-blur-xs"
          onClick={() => setMobileModulesOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] h-full overflow-y-auto bg-white dark:bg-[#0D0917] border-r border-slate-200 dark:border-white/10 p-4 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                NOVA Ecosystem
              </span>
              <button
                type="button"
                onClick={() => setMobileModulesOpen(false)}
                aria-label="Close navigation drawer"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {workspaceNavSections.map((sec) => (
              <div key={sec.group}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {sec.group}
                </div>
                <div className="mt-1.5 space-y-1">
                  {sec.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileModulesOpen(false);
                      }}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                        activeTab === item.id
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </span>
                      {item.badge && (
                        <span className="rounded bg-black/15 px-1.5 py-0.5 text-[10px] tabular-nums">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ringing Alarm Modal */}
      {ringingAlarm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-violet-400/40 bg-white dark:bg-[#120D1F] p-6 text-center space-y-5 shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-600/20 text-violet-600 dark:text-violet-300 nova-core-breathe">
              <AlarmClock className="h-8 w-8" />
            </div>
            <div>
              <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {ringingAlarm.time24}
              </div>
              <div className="mt-1 text-sm text-violet-700 dark:text-violet-200">
                {ringingAlarm.label}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  stopAlarmChime();
                  const snoozeDate = new Date(Date.now() + 5 * 60 * 1000);
                  const snoozeTime = `${String(snoozeDate.getHours()).padStart(2, '0')}:${String(
                    snoozeDate.getMinutes()
                  ).padStart(2, '0')}`;
                  const nowMs = Date.now();
                  const snoozeAlarm: AlarmItem = {
                    id: `snooze-${nowMs}`,
                    time24: snoozeTime,
                    label: `${ringingAlarm.label} (Snoozed)`,
                    enabled: true,
                    repeatDays: ['Daily'],
                    updatedAtMs: nowMs,
                  };
                  setAlarms((prev) => [...prev, snoozeAlarm]);
                  queueSyncMutation('alarms', snoozeAlarm.id, 'upsert', nowMs, snoozeAlarm);
                  setRingingAlarm(null);
                }}
                className="min-h-[46px] rounded-xl border border-violet-400/30 bg-slate-100 dark:bg-[#181228] text-xs font-semibold text-violet-700 dark:text-violet-200 hover:bg-violet-500/15"
              >
                Snooze 5 min
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAlarmChime();
                  setRingingAlarm(null);
                }}
                className="min-h-[46px] rounded-xl bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom 5-Tab Thumb Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-violet-500/15 dark:border-violet-400/15 bg-white/95 dark:bg-[#090612]/95 backdrop-blur-md lg:hidden"
        aria-label="Mobile Navigation"
      >
        <div className="grid grid-cols-5 h-16 pb-safe">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-1 transition-colors ${
                  active
                    ? 'text-violet-600 dark:text-violet-300'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Conversation History Sidebar */}
      <ConversationSidebar
        open={sidebarOpen}
        sessions={sessions}
        activeSessionId={activeSession.id}
        summarizingId={summarizingId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => {
          const fresh = createNewChatSession('New Conversation', activeSession.mode);
          if (activeProjectId) fresh.projectId = activeProjectId;
          setSessions((prev) => [fresh, ...prev]);
          setActiveSessionId(fresh.id);
          setAssistantView('chat');
        }}
        onSelectSession={(id) => {
          setActiveSessionId(id);
          setAssistantView('chat');
        }}
        onRenameSession={(id, title) =>
          updateSessionById(id, (s) => ({ ...s, title }))
        }
        onDeleteSession={(id) => {
          setSessions((prev) => {
            const filtered = prev.filter((s) => s.id !== id);
            if (filtered.length === 0) {
              const fallback = createNewChatSession('Main Conversation', 'normal');
              setActiveSessionId(fallback.id);
              return [fallback];
            }
            if (id === activeSession.id) {
              setActiveSessionId(filtered[0].id);
            }
            return filtered;
          });
        }}
        onSummarizeSession={(id) => void handleSummarizeSession(id)}
      />

      {/* Memory, Personalisation & Models Workspace Hub */}
      <WorkspaceHubModal
        open={workspaceHubOpen}
        initialTab={workspaceHubTab}
        memories={memories}
        personalisation={personalisation}
        preferredModel={preferredModel}
        voiceName={voiceName}
        onClose={() => setWorkspaceHubOpen(false)}
        onAddMemory={(content, category) => {
          const nowMs = Date.now();
          setMemories((prev) => [
            {
              id: `mem-${nowMs}`,
              content,
              category,
              scope: activeProject ? 'project' : 'general',
              ...(activeProject ? { projectId: activeProject.id } : {}),
              approved: true,
              active: true,
              createdAt: new Date().toLocaleDateString(),
              updatedAtMs: nowMs,
            },
            ...prev,
          ]);
        }}
        onUpdateMemory={(id, next) =>
          setMemories((prev) =>
            prev.map((m) => (m.id === id ? { ...m, ...next, updatedAtMs: Date.now() } : m))
          )
        }
        onDeleteMemory={(id) => setMemories((prev) => prev.filter((m) => m.id !== id))}
        onClearMemories={() => setMemories([])}
        onUpdatePersonalisation={(next) =>
          setPersonalisation((prev) => ({ ...prev, ...next }))
        }
        onChangePreferredModel={setPreferredModel}
        onChangeVoiceName={setVoiceName}
      />

      <FingerprintModal
        open={bioModalOpen}
        reason={bioReason}
        biometrics={biometrics}
        onClose={() => {
          pendingBioActionRef.current = null;
          setBioModalOpen(false);
        }}
        onVerify={async () => {
          const res = await verifyFingerprint();
          if (res.ok && pendingBioActionRef.current) {
            const fn = pendingBioActionRef.current;
            pendingBioActionRef.current = null;
            fn();
          }
          return res;
        }}
        onEnroll={async () => {
          const res = await enrollFingerprint();
          if (res.ok && pendingBioActionRef.current) {
            const fn = pendingBioActionRef.current;
            pendingBioActionRef.current = null;
            fn();
          }
          return res;
        }}
      />

      <OfflineIndicator />
    </div>
  );
}
