export type NavTab =
  | 'assistant'
  | 'projects'
  | 'studio'
  | 'code'
  | 'skills'
  | 'agents'
  | 'computer'
  | 'research'
  | 'connect'
  | 'scheduler'
  | 'memory'
  | 'files'
  | 'controls'
  | 'search'
  | 'shield'
  | 'control'
  | 'learn_languages'
  | 'image_studio'
  | 'pdf_studio';

export type NovaOrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'scanning';

export type IntelligenceMode = 'fast' | 'turbo' | 'deep' | 'offline';

export type NovaAIMode =
  | 'normal'
  | 'study'
  | 'developer'
  | 'research'
  | 'creative'
  | 'expert'
  | 'problem_solver';

export type PreferredModelId =
  | 'auto'
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-neon'
  | 'gemini-4-carbon';

export interface DeviceControlsState {
  wifi: boolean;
  bluetooth: boolean;
  dnd: boolean;
  flashlight: boolean;
  batterySaver: boolean;
  airplaneMode: boolean;
  location: boolean;
  autoSync: boolean;
  brightness: number; // 0-100
  volume: number; // 0-100
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  networkType: string;
  activeMedia: {
    title: string;
    artist: string;
    playing: boolean;
  };
}

export interface AlarmItem {
  id: string;
  time24: string; // "07:00"
  label: string;
  enabled: boolean;
  repeatDays: string[];
  lastTriggeredDate?: string;
  updatedAtMs?: number;
}

export interface AdaptedCommandCode {
  id: string;
  code: string; // e.g. "#nightmode" or "study mode"
  description: string;
  actions: Array<{
    setting?: string;
    booleanValue?: boolean;
    numericValue?: number;
    alarmTime?: string;
    alarmLabel?: string;
    replyNote?: string;
  }>;
  createdAt: string;
}

export interface QuickCommandKey {
  id: string;
  passkey: string; // Local auto-generated Nova macro passkey (e.g. nk_4f9a2c...)
  label: string;
  commandPrompt: string;
  operationType: 'macro' | 'generate-pdf' | 'generate-art' | 'security-lockdown';
  createdAt: string;
  lastUsedAt?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  dueTime: string;
  priority: 'high' | 'medium' | 'low';
  category: 'work' | 'personal' | 'alarm' | 'health';
  completed: boolean;
  proactiveNote?: string;
  updatedAtMs?: number;
}

export interface MobileIndexItem {
  id: string;
  title: string;
  subtitle: string;
  type: 'app' | 'file' | 'contact' | 'note' | 'setting' | 'pdf' | 'image';
  sizeOrMeta: string;
  updatedAt: string;
  contentPreview?: string;
  updatedAtMs?: number;
}

export interface SecurityAppAudit {
  id: string;
  appName: string;
  packageId: string;
  permissions: string[];
  backgroundDataMb: number;
  status: 'trusted' | 'review' | 'flagged';
  lastActive: string;
  reason?: string;
}

export interface ThreatAnalysisResult {
  verdict: 'safe' | 'caution' | 'threat';
  summary: string;
  indicators: string[];
  recommendedAction: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface NovaToolAction {
  type:
    | 'controlDeviceSetting'
    | 'setAlarm'
    | 'manageTask'
    | 'searchMobileIndex'
    | 'runSecurityAudit'
    | 'generatePicture'
    | 'generateVectorArt'
    | 'generatePdfDocument'
    | 'adaptCommandCode'
    | 'generateQuickCommandKey'
    | 'suggestMemory';
  args: Record<string, unknown>;
  requiresBiometric?: boolean;
  executed?: boolean;
  resultText?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataBase64: string;
  sizeLabel: string;
}

export interface GeneratedPdfRecord {
  id: string;
  title: string;
  subtitle: string;
  pageCount: number;
  base64Data: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
  blocks?: PdfContentBlock[];
  layoutConfig?: PdfLayoutConfig;
  updatedAt: string;
}

export interface GeneratedImageRecord {
  id: string;
  prompt: string;
  enhancedPrompt?: string;
  stylePreset?: ArtworkStylePreset;
  aspectRatio: string;
  imageSize?: '1K' | '2K' | '4K';
  width?: number;
  height?: number;
  byteLength?: number;
  mimeType?: string;
  modelUsed?: string;
  sourceKind?: 'ai_generated' | 'real_photo' | 'uploaded';
  attribution?: string;
  license?: string;
  provider?: string;
  sourceUrl?: string;
  dataUrl: string;
  createdAt: string;
}

export interface ReviewReport {
  overallAssessment: string;
  readinessScore: number;
  strengths: string[];
  issues: Array<{
    severity: 'high' | 'medium' | 'low';
    location: string;
    detail: string;
    suggestion: string;
  }>;
  improvedDraft: string;
}

export interface PublicMediaResult {
  id: string;
  title: string;
  creator: string;
  mediaType: 'movies' | 'audio';
  year?: string;
  description?: string;
  streamUrl: string;
  downloadUrl: string;
  fileName: string;
  archivePageUrl: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  sources?: GroundingSource[];
  actions?: NovaToolAction[];
  generatedImageUrl?: string;
  generatedImagePrompt?: string;
  generatedPdf?: GeneratedPdfRecord;
  offlineProcessed?: boolean;
  attachmentNames?: string[];
  streaming?: boolean;
  modeUsed?: NovaAIMode;
  modelUsed?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: NovaAIMode;
  projectId?: string;
  summary?: string;
  updatedAt: string;
  updatedAtMs: number;
  messages: ChatMessage[];
}

export interface MemoryItem {
  id: string;
  content: string;
  category: 'preference' | 'fact' | 'workflow' | 'project';
  scope?: 'general' | 'project';
  projectId?: string;
  approved: boolean;
  active: boolean;
  createdAt: string;
  updatedAtMs: number;
}

export interface PersonalisationSettings {
  customInstructions: string;
  responseStyle: 'balanced' | 'concise' | 'detailed' | 'technical' | 'friendly' | 'socratic';
  language: string;
  responseLength: 'short' | 'medium' | 'comprehensive';
  theme: 'dark' | 'light';
  speechRate: number; // 0.8 - 1.3
}

export interface ProjectSourceFile {
  id: string;
  path: string;
  name: string;
  language: string;
  size: number;
  content: string;
}

export type AgentStepTool =
  | 'web_research'
  | 'vault_search'
  | 'reason_analyze'
  | 'generate_pdf'
  | 'generate_art'
  | 'create_task'
  | 'set_alarm'
  | 'device_control'
  | 'security_scan';

export interface AgentStep {
  id: string;
  title: string;
  description: string;
  tool: AgentStepTool;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
  status: 'pending' | 'running' | 'awaiting_confirmation' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}

export interface AgentRunPlan {
  id: string;
  objective: string;
  status: 'idle' | 'planning' | 'running' | 'paused_for_confirm' | 'completed' | 'failed';
  steps: AgentStep[];
  finalReport?: string;
  createdAt: string;
}

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  endpoint: string;
  model: string;
  status: number;
  latencyMs: number;
  ok: boolean;
  message: string;
}

export interface ServerModelsStatus {
  apiKeyConfigured: boolean;
  activeModels: Array<{
    id: string;
    label: string;
    role: string;
    tier: 'standard' | 'paid';
  }>;
  metrics: {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgLatencyMs: number;
    perModelCalls: Record<string, number>;
  };
  recentLogs: ApiLogEntry[];
}

export interface BiometricState {
  enrolled: boolean;
  credentialId: string | null;
  unlockedUntil: number | null;
  lastVerifiedMethod: 'webauthn' | 'device-pin-fallback' | null;
  hardwareSupported: boolean;
}

export interface PrivacySettings {
  ownerLockEnabled: boolean;
  ownerPin: string; // 4-digit private local PIN
  incognitoMode: boolean;
  strictOfflinePrivacy: boolean;
}

export type SyncCollectionName = 'tasks' | 'alarms' | 'indexedFiles';

export interface SyncOutboxMutation {
  key: string;
  collection: SyncCollectionName;
  docId: string;
  op: 'upsert' | 'delete';
  updatedAtMs: number;
  payload?: TaskItem | AlarmItem | MobileIndexItem;
}

export interface BackgroundSyncState {
  status: 'idle' | 'syncing' | 'offline' | 'signed_out' | 'paused' | 'error';
  pendingCount: number;
  lastSyncedAt: string | null;
  lastSummary: string | null;
  errorMessage: string | null;
}

// ============================================================================
// CLAUDE-INSPIRED 12-MODULE ECOSYSTEM TYPES
// ============================================================================

export interface ProjectDocument {
  id: string;
  name: string;
  folder: string;
  sizeLabel: string;
  mimeType: string;
  excerpt: string;
  content: string;
  addedAt: string;
}

export interface ProjectActivityEntry {
  id: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface NovaProject {
  id: string;
  name: string;
  description: string;
  instructions: string;
  archived: boolean;
  folders: string[];
  documents: ProjectDocument[];
  activity: ProjectActivityEntry[];
  createdAt: string;
  updatedAtMs: number;
}

export interface ArtifactVersion {
  id: string;
  versionNumber: number;
  promptOrEdit: string;
  summary: string;
  code: string;
  createdAt: string;
}

export interface StudioArtifact {
  id: string;
  projectId?: string;
  title: string;
  kind: 'html' | 'react' | 'dashboard' | 'diagram';
  summary: string;
  currentCode: string;
  versions: ArtifactVersion[];
  chatNotes: Array<{ role: 'user' | 'assistant'; text: string }>;
  updatedAt: string;
  updatedAtMs: number;
}

export interface NovaSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  triggers: string[];
  autoDetect: boolean;
  enabled: boolean;
  builtIn: boolean;
  category: string;
}

export type SpecialistAgentRole =
  | 'planning'
  | 'research'
  | 'coding'
  | 'testing'
  | 'data_analysis'
  | 'documentation'
  | 'qa';

export interface MultiAgentWorkerRun {
  agent: SpecialistAgentRole;
  subtask: string;
  status: 'completed' | 'failed';
  durationMs: number;
  output: string;
}

export interface MultiAgentConflict {
  topic: string;
  agentsInvolved: string[];
  detail: string;
  resolution: string;
}

export interface MultiAgentRunResult {
  id: string;
  goal: string;
  complexity: 'simple' | 'complex';
  skippedMultiAgent: boolean;
  coordinatorSummary: string;
  agentRuns: MultiAgentWorkerRun[];
  conflicts: MultiAgentConflict[];
  finalOutput: string;
  durationMs: number;
  createdAt: string;
}

export interface ComputerStep {
  id: string;
  kind: 'fetch_page' | 'extract_data' | 'inspect_workspace' | 'submit_form' | 'analyze_screen';
  label: string;
  preview: string;
  target: string;
  selectorOrQuery?: string;
  requiresConfirmation: boolean;
  status: 'pending' | 'approved' | 'executed' | 'cancelled' | 'error';
  result?: {
    finalUrl?: string;
    status?: number;
    title?: string;
    headings?: string[];
    links?: Array<{ text: string; href: string }>;
    forms?: Array<{ action: string; method: string; fields: string[] }>;
    tables?: Array<{ headers: string[]; rows: string[][] }>;
    textExtract?: string;
    sanitizedHtml?: string;
    extractedMatches?: string[];
    analysisText?: string;
    filePath?: string;
  };
  error?: string;
}

export interface ResearchReport {
  id: string;
  projectId?: string;
  query: string;
  title: string;
  executiveSummary: string;
  queriesInvestigated: string[];
  verifiedFacts: Array<{ claim: string; sourceLabel: string; confidence: string }>;
  assumptionsAndUncertainties: string[];
  conflictingClaims: Array<{ topic: string; perspectiveA: string; perspectiveB: string }>;
  sections: Array<{ heading: string; content: string }>;
  citations: Array<{ id: string; title: string; uri: string }>;
  durationMs: number;
  createdAt: string;
}

export type PermissionMode = 'auto' | 'ask' | 'deny';

export interface ConnectorPublicInfo {
  id: string;
  name: string;
  kind: 'mcp' | 'github' | 'rest_api' | 'database';
  endpointUrl: string;
  description: string;
  headerName?: string;
  permissionMode: PermissionMode;
  status: 'connected' | 'untested' | 'error';
  lastCheckedAt?: string;
  lastError?: string;
  discoveredTools?: Array<{ name: string; description?: string }>;
  hasSecret: boolean;
}

export interface SchedulerJobItem {
  id: string;
  title: string;
  kind: 'daily_summary' | 'weekly_report' | 'scheduled_research' | 'task_reminder';
  prompt: string;
  cadence: 'once' | 'hourly' | 'daily' | 'weekly' | 'cron';
  cronExpr?: string;
  enabled: boolean;
  nextRunAtMs: number;
  lastRunAt?: string;
  lastResult?: string;
  runCount: number;
  history: Array<{ id: string; ranAt: string; ok: boolean; outputSummary: string }>;
  createdAt: string;
}

export interface SchedulerNotifItem {
  id: string;
  jobId: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export type WorkspaceFileFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'txt' | 'md';

export interface WorkspaceFileVersion {
  id: string;
  version: number;
  note: string;
  contentText: string;
  savedAt: string;
}

export interface WorkspaceFileRecord {
  id: string;
  projectId?: string;
  name: string;
  format: WorkspaceFileFormat;
  contentText: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  summary?: string;
  versions: WorkspaceFileVersion[];
  updatedAt: string;
  updatedAtMs: number;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  timestampMs: number;
  module: string;
  action: string;
  actor: string;
  outcome: 'allowed' | 'blocked' | 'pending' | 'error' | 'executed';
  details: string;
}

export interface ControlOverviewData {
  toolPermissions: Record<string, PermissionMode>;
  rateLimitMaxPerMinute: number;
  rateLimitTelemetry: {
    blockedCount: number;
    totalChecked: number;
    lastWindowRequests: number;
  };
  pendingApprovals: Array<{
    id: string;
    module: string;
    title: string;
    summary: string;
    createdAt: string;
    status: 'pending' | 'approved' | 'cancelled';
  }>;
  auditLogs: AuditLogRecord[];
}

// ============================================================================
// LEARN LANGUAGES MODULE TYPES
// ============================================================================

export type SupportedLanguageCode =
  | 'ja'
  | 'en'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'zh'
  | 'it'
  | 'pt'
  | 'hi'
  | 'ta';

export type ProficiencyLevel =
  | 'Absolute Beginner'
  | 'Beginner'
  | 'Elementary'
  | 'Intermediate'
  | 'Upper Intermediate'
  | 'Advanced';

export type LanguageTrackSkill =
  | 'Hiragana'
  | 'Katakana'
  | 'Kanji'
  | 'Script'
  | 'Vocabulary'
  | 'Grammar'
  | 'Sentence Formation'
  | 'Listening'
  | 'Speaking'
  | 'Checkpoint'
  | 'Revision';

export type ExerciseKind =
  | 'multiple_choice'
  | 'sentence_builder'
  | 'script_match'
  | 'typing_translate'
  | 'listening'
  | 'speaking';

export interface ScriptMatchPair {
  id: string;
  left: string;
  right: string;
}

export interface LessonExercise {
  id: string;
  kind: ExerciseKind;
  skill: LanguageTrackSkill;
  promptNative: string;
  promptTarget?: string;
  romanization?: string;
  audioText?: string;
  options?: string[];
  correctAnswer: string;
  acceptedAnswers?: string[];
  wordBank?: string[];
  matchPairs?: ScriptMatchPair[];
  grammarTip: string;
}

export interface LanguageLesson {
  id: string;
  chapterId: string;
  title: string;
  subtitle: string;
  skill: LanguageTrackSkill;
  lessonKind: 'lesson' | 'checkpoint' | 'revision';
  xpReward: number;
  estimatedMinutes: number;
  exercises: LessonExercise[];
}

export interface CurriculumChapter {
  id: string;
  title: string;
  focusSkill: LanguageTrackSkill;
  description: string;
  lessons: LanguageLesson[];
}

export interface CurriculumUnit {
  id: string;
  unitNumber: number;
  title: string;
  cefrOrLevel: ProficiencyLevel;
  description: string;
  chapters: CurriculumChapter[];
}

export interface KanaOrScriptItem {
  id: string;
  char: string;
  reading: string;
  meaning?: string;
  category: 'Hiragana' | 'Katakana' | 'Kanji' | 'Script';
  onyomi?: string;
  kunyomi?: string;
  strokeCount?: number;
  exampleWord: string;
  exampleReading: string;
  exampleMeaning: string;
}

export interface VocabCard {
  id: string;
  term: string;
  reading?: string;
  meaning: string;
  example: string;
  skill: LanguageTrackSkill;
  mastery: number; // 0-100
  dueAtMs: number;
  mistakeCount: number;
}

export interface LanguageTutorMessage {
  id: string;
  role: 'user' | 'assistant';
  textTarget: string;
  phonetics?: string;
  translationNative?: string;
  correction?: string;
  grammarNotes?: string[];
  timestamp: string;
}

export interface LanguageProfileProgress {
  targetLanguage: SupportedLanguageCode;
  nativeLanguage: SupportedLanguageCode;
  level: ProficiencyLevel;
  levelSelected: boolean;
  xp: number;
  dailyXp: number;
  dailyGoalXp: number;
  streakDays: number;
  lastActiveDate: string;
  hearts: number;
  practiceUnlimitedHearts: boolean;
  completedLessonIds: string[];
  completedCheckpointIds: string[];
  unlockedUnitNumbers: number[];
  mistakeExerciseIds: string[];
  vocabBank: VocabCard[];
  customUnits: CurriculumUnit[];
  tutorHistory: LanguageTutorMessage[];
  updatedAtMs: number;
}

export interface LearnLanguagesState {
  nativeLanguage: SupportedLanguageCode;
  activeTargetLanguage: SupportedLanguageCode;
  showRomanization: boolean;
  autoPlayAudio: boolean;
  ttsSpeed: 'normal' | 'slow';
  profiles: Partial<Record<SupportedLanguageCode, LanguageProfileProgress>>;
}

// ============================================================================
// IMAGE STUDIO & PDF STUDIO TYPES
// ============================================================================

export type ArtworkStylePreset =
  | 'auto'
  | 'photorealistic'
  | 'cinematic'
  | 'anime'
  | 'wallpaper'
  | 'fantasy'
  | 'architecture'
  | 'product'
  | '3d_artwork'
  | 'character'
  | 'educational';

export type ImageSearchProviderId = 'auto' | 'wikimedia' | 'pexels' | 'unsplash';

export interface RealPhotoSearchResult {
  id: string;
  title: string;
  photographer: string;
  license: string;
  licenseUrl?: string;
  provider: 'Wikimedia Commons' | 'Pexels' | 'Unsplash';
  width: number;
  height: number;
  thumbUrl: string;
  fullUrl: string;
  attributionText: string;
}

export interface StudioProviderStatus {
  geminiConfigured: boolean;
  pexelsConfigured: boolean;
  unsplashConfigured: boolean;
  wikimediaActive: boolean;
  pdfEngineLocal: boolean;
  usage: {
    dateKey: string;
    imagesGeneratedToday: number;
    dailyImageLimit: number;
    photoSearchesToday: number;
    dailyPhotoSearchLimit: number;
    pdfGenerationsToday: number;
  };
}

export type PdfPageSize = 'a4' | 'letter' | 'legal';
export type PdfOrientation = 'portrait' | 'landscape';
export type PdfFontFamily = 'helvetica' | 'times' | 'courier';
export type PdfTextAlign = 'left' | 'justify' | 'center' | 'right';
export type PdfMarginPreset = 'compact' | 'standard' | 'wide';
export type PdfTemplatePreset = 'executive' | 'minimal' | 'academic' | 'portfolio';

export interface PdfLayoutConfig {
  template: PdfTemplatePreset;
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  fontFamily: PdfFontFamily;
  textAlign: PdfTextAlign;
  marginPreset: PdfMarginPreset;
  includePageNumbers: boolean;
  includeHeaderRule: boolean;
  accentHex: string;
}

export type PdfContentBlock =
  | {
      id: string;
      kind: 'section';
      heading: string;
      paragraphs: string[];
      bullets: string[];
    }
  | {
      id: string;
      kind: 'image';
      caption: string;
      dataUrl: string;
      sourceKind: 'ai_generated' | 'real_photo' | 'uploaded';
      attribution?: string;
      widthPercent: 50 | 75 | 100;
      align: 'left' | 'center' | 'right';
    }
  | {
      id: string;
      kind: 'table';
      title: string;
      headers: string[];
      rows: string[][];
    }
  | {
      id: string;
      kind: 'chart';
      title: string;
      chartType: 'bar' | 'line' | 'pie';
      unitLabel?: string;
      data: Array<{ label: string; value: number }>;
    };


