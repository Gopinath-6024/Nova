import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  FunctionDeclaration,
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type Part,
} from '@google/genai';
import { startBackendScheduler } from './server/novaStore';
import { createEcosystemRouter } from './server/routes/ecosystemRoutes';
import { createLanguageRouter } from './server/routes/languageRoutes';
import { createMediaStudioRouter } from './server/routes/mediaStudioRoutes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

const aiClientCache = new Map<string, GoogleGenAI>();

interface ServerTelemetryLog {
  id: string;
  timestamp: string;
  endpoint: string;
  model: string;
  status: number;
  latencyMs: number;
  ok: boolean;
  message: string;
}

const serverTelemetry = {
  totalRequests: 0,
  successCount: 0,
  errorCount: 0,
  totalLatencyMs: 0,
  perModelCalls: {} as Record<string, number>,
  recentLogs: [] as ServerTelemetryLog[],
};

function recordApiTelemetry(
  endpoint: string,
  model: string,
  status: number,
  latencyMs: number,
  ok: boolean,
  message: string
) {
  serverTelemetry.totalRequests += 1;
  if (ok) {
    serverTelemetry.successCount += 1;
  } else {
    serverTelemetry.errorCount += 1;
  }
  serverTelemetry.totalLatencyMs += Math.max(0, Math.round(latencyMs));
  serverTelemetry.perModelCalls[model] = (serverTelemetry.perModelCalls[model] ?? 0) + 1;

  serverTelemetry.recentLogs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    endpoint,
    model,
    status,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    ok,
    message: message.slice(0, 220),
  });
  if (serverTelemetry.recentLogs.length > 50) {
    serverTelemetry.recentLogs.length = 50;
  }
}

const MODEL_CATALOG: Array<{
  id: string;
  label: string;
  role: string;
  tier: 'standard' | 'paid';
}> = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    role: 'Primary reasoning, agent planning, code & multimodal intelligence',
    tier: 'standard',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    role: 'Ultra-low latency instant Q&A & conversation summarization',
    tier: 'standard',
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    role: 'High-depth coding & math intelligence (falls back automatically if unavailable)',
    tier: 'paid',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    role: 'Balanced multi-step creative & analytical reasoning (auto-fallback enabled)',
    tier: 'paid',
  },
];

function getAllowedThinkingLevel(
  model: string,
  desired: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH'
): ThinkingLevel {
  if (model === 'gemini-3.1-flash-lite') {
    if (desired === 'MINIMAL') return ThinkingLevel.MINIMAL;
    if (desired === 'HIGH' || desired === 'XHIGH') return ThinkingLevel.HIGH;
    return desired === 'MEDIUM' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;
  }
  if (model === 'gemini-4-carbon') {
    if (desired === 'XHIGH') return ThinkingLevel.HIGH;
    if (desired === 'MINIMAL') return ThinkingLevel.LOW;
    return desired === 'HIGH'
      ? ThinkingLevel.HIGH
      : desired === 'MEDIUM'
      ? ThinkingLevel.MEDIUM
      : ThinkingLevel.LOW;
  }
  // gemini-4-hydrogen / gemini-4-neon support LOW, MEDIUM, HIGH, XHIGH (not MINIMAL)
  if (desired === 'MINIMAL') return ThinkingLevel.LOW;
  if (desired === 'XHIGH') return ThinkingLevel.XHIGH;
  if (desired === 'HIGH') return ThinkingLevel.HIGH;
  if (desired === 'MEDIUM') return ThinkingLevel.MEDIUM;
  return ThinkingLevel.LOW;
}

function resolveChatModelCandidates(
  preferredModel: unknown,
  reasoningMode: string,
  useTools: boolean,
  useSearch: boolean,
  isComplexStem: boolean
): string[] {
  const validPreferred =
    typeof preferredModel === 'string' &&
    MODEL_CATALOG.some((m) => m.id === preferredModel)
      ? preferredModel
      : 'auto';

  if (validPreferred !== 'auto') {
    const chain = [validPreferred, 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
    return Array.from(new Set(chain));
  }

  if (reasoningMode === 'deep') {
    return ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  }
  if (reasoningMode === 'turbo' || (!useTools && !useSearch && !isComplexStem)) {
    return ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
  }
  return ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
}

function getAiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  const cacheKey = `${apiVersion ?? 'default'}:${apiKey}`;
  const cached = aiClientCache.get(cacheKey);
  if (cached) return cached;

  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(apiVersion ? { apiVersion } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  aiClientCache.set(cacheKey, client);
  return client;
}

function tryGetAiClient(): GoogleGenAI | null {
  try {
    return getAiClient();
  } catch {
    return null;
  }
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    lower.includes('high demand') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  );
}

function isPaidTierQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('free_tier_requests') ||
    msg.includes('free_tier_input_token_count') ||
    msg.includes('limit: 0')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isModelFallbackError(err: unknown): boolean {
  if (isRateLimitError(err) || isPaidTierQuotaError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('NOT_FOUND') ||
    msg.includes('404') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('403') ||
    msg.includes('INVALID_ARGUMENT')
  );
}

async function generateWithResilience(
  ai: GoogleGenAI,
  attempts: Array<{
    model: string;
    contents: unknown;
    config?: Record<string, unknown>;
  }>
) {
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: attempt.contents as never,
        config: attempt.config as never,
      });
      return { response, modelUsed: attempt.model };
    } catch (err) {
      lastErr = err;
      if (isModelFallbackError(err) && i < attempts.length - 1) {
        await sleep(350 * (i + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function getGeminiErrorStatus(err: unknown): {
  status: number;
  message: string;
  paidKeyRequired?: boolean;
} {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message:
        'Gemini API permission or key error. Please verify your API key in Settings > Secrets.',
      paidKeyRequired: true,
    };
  }
  if (isPaidTierQuotaError(err)) {
    return {
      status: 402,
      message:
        'AI Picture and Music generation use paid Gemini models (free-tier quota is 0). Please select a billing-enabled API key in Settings > Secrets.',
      paidKeyRequired: true,
    };
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'Gemini model is momentarily busy. Please retry in a second.',
    };
  }
  if (isRateLimitError(err)) {
    return {
      status: 429,
      message:
        'Gemini API quota reached (429). Please retry in a moment or select a billing-enabled API key in Settings > Secrets.',
    };
  }
  if (msg.includes('NOT_FOUND') || msg.includes('404')) {
    return {
      status: 404,
      message: 'Requested Gemini model was not found.',
    };
  }
  return {
    status: 500,
    message: msg || 'Internal server error',
  };
}

const controlDeviceSettingDecl: FunctionDeclaration = {
  name: 'controlDeviceSetting',
  description:
    'Control Android/mobile device settings, hardware toggles, sliders, or media playback.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      setting: {
        type: Type.STRING,
        description:
          'Target setting: wifi, bluetooth, dnd, flashlight, batterySaver, airplaneMode, location, autoSync, brightness, volume, mediaPlayPause, mediaNext, openApp',
      },
      booleanValue: { type: Type.BOOLEAN, description: 'On/off value.' },
      numericValue: { type: Type.NUMBER, description: '0-100 level for brightness/volume.' },
      appName: { type: Type.STRING, description: 'App name if openApp.' },
    },
    required: ['setting'],
  },
};

const setAlarmDecl: FunctionDeclaration = {
  name: 'setAlarm',
  description:
    'Set, toggle, or cancel a real ticking mobile alarm with ringtone chime.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, description: 'One of: set, cancel, toggle' },
      time: { type: Type.STRING, description: '24-hour HH:MM format, e.g. "07:30" or "18:45".' },
      label: { type: Type.STRING, description: 'Alarm label.' },
    },
    required: ['action', 'time'],
  },
};

const manageTaskDecl: FunctionDeclaration = {
  name: 'manageTask',
  description: 'Create, complete, delete, or reschedule tasks and reminders.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, description: 'add, complete, delete, reschedule' },
      title: { type: Type.STRING, description: 'Task title.' },
      dueTime: { type: Type.STRING, description: 'Due time string.' },
      priority: { type: Type.STRING, description: 'high, medium, low' },
      category: { type: Type.STRING, description: 'work, personal, alarm, health' },
    },
    required: ['action', 'title'],
  },
};

const searchMobileIndexDecl: FunctionDeclaration = {
  name: 'searchMobileIndex',
  description: 'Search saved PDFs, images, files, apps, contacts, notes, and settings.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Search keywords.' },
      scope: { type: Type.STRING, description: 'all, app, file, pdf, image, contact, note, setting' },
    },
    required: ['query'],
  },
};

const runSecurityAuditDecl: FunctionDeclaration = {
  name: 'runSecurityAudit',
  description: 'Run a virus, malware, suspicious activity, or app permission scan.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      scanType: { type: Type.STRING, description: 'quick, deep, network, permissions' },
      targetDetail: { type: Type.STRING, description: 'Optional target.' },
    },
    required: ['scanType'],
  },
};

const generatePictureDecl: FunctionDeclaration = {
  name: 'generatePicture',
  description:
    'Generate premium high-resolution AI artwork, photorealistic scenes, anime illustrations, cinematic stills, wallpapers, product shots, or 3D renders via dedicated Gemini Image models whenever the user asks Nova to draw, create, paint, design, or generate an image.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: 'Detailed visual prompt for the image.' },
      aspectRatio: {
        type: Type.STRING,
        description: 'One of: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 4:1, 1:4. Default 1:1.',
      },
      stylePreset: {
        type: Type.STRING,
        description:
          'Optional visual style: auto, photorealistic, cinematic, anime, wallpaper, fantasy, architecture, product, 3d_artwork, character, educational.',
      },
    },
    required: ['prompt'],
  },
};

const generatePdfDocumentDecl: FunctionDeclaration = {
  name: 'generatePdfDocument',
  description:
    'Generate a structured, downloadable PDF document on any topic requested by the user.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING, description: 'Subject or instructions for the PDF.' },
      title: { type: Type.STRING, description: 'Clean document title.' },
      tone: { type: Type.STRING, description: 'professional, academic, concise, or creative' },
    },
    required: ['topic', 'title'],
  },
};

const adaptCommandCodeDecl: FunctionDeclaration = {
  name: 'adaptCommandCode',
  description:
    'Teach or adapt a custom user command code, macro, or shortcut rule when the user gives Nova a code or adaptation instruction in chat.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      code: { type: Type.STRING, description: 'Trigger code or phrase, e.g. "#focus" or "night mode".' },
      description: { type: Type.STRING, description: 'What the code does.' },
      setting: { type: Type.STRING, description: 'Optional phone setting to adjust (dnd, wifi, brightness, volume, batterySaver, etc.).' },
      booleanValue: { type: Type.BOOLEAN, description: 'Optional boolean toggle value.' },
      numericValue: { type: Type.NUMBER, description: 'Optional numeric slider value.' },
      alarmTime: { type: Type.STRING, description: 'Optional HH:MM alarm time.' },
      alarmLabel: { type: Type.STRING, description: 'Optional alarm label.' },
    },
    required: ['code', 'description'],
  },
};

const generateVectorArtDecl: FunctionDeclaration = {
  name: 'generateVectorArt',
  description:
    'Generate clean geometric SVG vector icons, logos, or diagrams ONLY when the user explicitly asks for raw SVG code or scalable vector shapes. Never use for AI paintings, photorealism, portraits, wallpapers, or illustrations.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: 'Description of the geometric SVG diagram or icon.' },
      aspectRatio: {
        type: Type.STRING,
        description: 'One of: 1:1, 16:9, 9:16, 4:3, 3:4. Default 1:1.',
      },
    },
    required: ['prompt'],
  },
};

const generateQuickCommandKeyDecl: FunctionDeclaration = {
  name: 'generateQuickCommandKey',
  description:
    'Auto-generate a private Nova Command Passkey bound to a quick command macro or instant PDF/art generation workflow.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      label: { type: Type.STRING, description: 'Short friendly name for this quick command passkey.' },
      commandPrompt: { type: Type.STRING, description: 'The command or generation prompt to execute when invoked.' },
      operationType: {
        type: Type.STRING,
        description: 'One of: macro, generate-pdf, generate-art, security-lockdown',
      },
    },
    required: ['label', 'commandPrompt', 'operationType'],
  },
};

const suggestMemoryDecl: FunctionDeclaration = {
  name: 'suggestMemory',
  description:
    'Propose saving an important long-term user preference, fact, workflow, or ongoing project detail to NOVA Memory so the user can approve it.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      content: {
        type: Type.STRING,
        description: 'Concise factual statement worth remembering across chats.',
      },
      category: {
        type: Type.STRING,
        description: 'One of: preference, fact, workflow, project',
      },
    },
    required: ['content', 'category'],
  },
};

const NOVA_AI_MODE_INSTRUCTIONS: Record<string, string> = {
  normal:
    'Normal Mode: Balanced, natural, clear, accurate everyday AI assistant. Direct answers first with helpful formatting.',
  study:
    'Study Mode: Act as an extraordinary Socratic tutor & educator. Break concepts down intuitively from first principles, give memorable analogies, verify understanding with 1 quick practice check or takeaway, and highlight key formulas/definitions.',
  developer:
    'Developer Mode: Act as a principal software architect & polyglot engineer. Write production-ready, type-safe, edge-case-hardened code with clear language-tagged Markdown code blocks, complexity notes, security checks, and zero pseudo-code shortcuts.',
  research:
    'Research Mode: Act as an investigative analyst. Cross-check claims carefully, compare perspectives, cite grounded web sources when available, flag uncertainty explicitly, and structure findings with executive clarity.',
  creative:
    'Creative Mode: Act as an imaginative writer, designer, and brainstorm partner. Deliver vivid, original ideas, compelling narrative flow, and unexpected creative angles while respecting constraints.',
  expert:
    'Expert Mode: Act as a domain specialist delivering high-precision technical, scientific, or strategic analysis without oversimplifying terminology or skipping critical caveats.',
  problem_solver:
    'Problem Solver Mode: Decompose the problem systematically into root causes, constraints, numbered diagnostic steps, actionable options with trade-offs, and a clear recommended resolution.',
};

interface PersonalisationPayload {
  customInstructions?: string;
  responseStyle?: string;
  language?: string;
  responseLength?: string;
}

function buildPersonalisationAndMemoryBlock(params: {
  aiMode?: string;
  personalisation?: PersonalisationPayload;
  memories?: Array<{ content?: string; category?: string }>;
  conversationSummary?: string;
  activeProject?: {
    name?: string;
    instructions?: string;
    documents?: Array<{ name?: string; folder?: string; excerpt?: string }>;
  } | null;
  activeSkills?: Array<{ name?: string; instructions?: string }>;
}): string {
  const {
    aiMode = 'normal',
    personalisation = {},
    memories = [],
    conversationSummary = '',
    activeProject = null,
    activeSkills = [],
  } = params;
  const parts: string[] = [];

  const modePrompt = NOVA_AI_MODE_INSTRUCTIONS[aiMode] ?? NOVA_AI_MODE_INSTRUCTIONS.normal;
  parts.push(`- Active Mode: ${modePrompt}`);

  if (activeProject && activeProject.name) {
    parts.push(
      `- Isolated Active Project ("${String(activeProject.name).slice(0, 80)}"): Stay strictly scoped to this project's context without mixing unrelated project details.`
    );
    if (activeProject.instructions?.trim()) {
      parts.push(`- Project Instructions: ${activeProject.instructions.trim().slice(0, 1000)}`);
    }
    if (Array.isArray(activeProject.documents) && activeProject.documents.length > 0) {
      const docSummary = activeProject.documents
        .slice(0, 8)
        .map(
          (d) =>
            `[${d.folder || 'Root'}/${d.name || 'doc'}]: ${String(d.excerpt ?? '').slice(0, 280)}`
        )
        .join(' | ');
      parts.push(`- Project Knowledge Files: ${docSummary}`);
    }
  }

  if (Array.isArray(activeSkills) && activeSkills.length > 0) {
    const skillText = activeSkills
      .slice(0, 5)
      .map((s) => `${s.name}: ${String(s.instructions ?? '').slice(0, 320)}`)
      .join(' || ');
    parts.push(`- Active NOVA Skills Workflow: ${skillText}`);
  }

  if (personalisation.responseStyle) {
    parts.push(`- Preferred Style: ${personalisation.responseStyle}`);
  }
  if (personalisation.responseLength === 'short') {
    parts.push('- Response Length: Keep replies crisp and brief (under 140 words unless code/steps require more).');
  } else if (personalisation.responseLength === 'comprehensive') {
    parts.push('- Response Length: Provide thorough, comprehensive depth with examples and edge cases.');
  }
  if (personalisation.language && personalisation.language !== 'auto') {
    parts.push(`- Preferred Reply Language: ${personalisation.language} (unless the user explicitly asks in another language to translate).`);
  }
  if (personalisation.customInstructions && personalisation.customInstructions.trim()) {
    parts.push(`- User Custom Instructions: ${personalisation.customInstructions.trim().slice(0, 600)}`);
  }
  if (Array.isArray(memories) && memories.length > 0) {
    const memLines = memories
      .slice(0, 12)
      .map((m) => `[${m.category ?? 'fact'}] ${String(m.content ?? '').slice(0, 180)}`)
      .join(' | ');
    parts.push(`- Scoped Approved Memories: ${memLines}`);
  }
  if (conversationSummary && conversationSummary.trim()) {
    parts.push(`- Earlier Conversation Context Summary: ${conversationSummary.trim().slice(0, 900)}`);
  }
  return parts.join('\n');
}

function needsWebSearch(text: string): boolean {
  if (/https?:\/\/\S+/i.test(text)) return true;
  return /\b(latest|news|weather|price|stock|score|today|tonight|current|currently|who\s+is|who\s+won|what\s+happened|2025|2026|president|ceo|prime\s+minister|search\s+web|google|release|live|recent|trending|update)\b/i.test(
    text
  );
}

function needsPhoneOrCreativeTools(text: string, hasAttachments: boolean): boolean {
  if (hasAttachments) return true;
  return /\b(wi-?fi|bluetooth|dnd|do\s+not\s+disturb|flashlight|torch|brightness|volume|alarm|wake\s*me|battery\s*saver|airplane|flight\s*mode|location|gps|auto-?sync|remind|task|todo|vault|my\s+file|my\s+phone|virus|malware|spyware|scan|security|permission|picture|pictures|pic|pics|image|images|photo|wallpaper|art|artwork|draw|sketch|paint|poster|illustration|pdf|document|report|adapt\s+code|passkey|open\s+app|play\s+music|pause\s+music|next\s+track|remember\s+that|save\s+to\s+memory|memorize)\b|#|nk_/i.test(
    text
  );
}

function needsDeepAccuracyReasoning(text: string): boolean {
  return /\b(code|debug|error|bug|function|algorithm|prove|proof|derive|equation|calculate|integral|derivative|matrix|probability|statistics|compare|analyze|explain\s+why|difference\s+between|architecture|regex|sql|python|typescript|javascript|react|java|c\+\+|rust|physics|chemistry|biology|medical|legal|diagnose)\b/i.test(
    text
  );
}

function buildFastQASystemInstruction(
  slangMirroring: boolean,
  proactiveMode: boolean,
  extraContextBlock: string
): string {
  return `You are Nova, an ultra-fast, world-class AI companion known for instant, razor-sharp, 100% accurate answers.
- Reply in the EXACT language of the user (unless overridden by Personalisation). ${
    slangMirroring ? "Mirror the user's vibe and slang naturally without hurting clarity." : 'Keep a warm, crisp human tone.'
  }
- Lead immediately with the exact direct answer in the opening sentence—never waste words on filler intros like "Great question!".
- Silently double-check math, logic, edge cases, dates, and code syntax before writing so every answer is completely accurate. If something cannot be verified, state it honestly instead of guessing.
- Format cleanly in Markdown for instant reading (bold key answers, tight steps, language-tagged code blocks).${
    proactiveMode ? ' Add at most one ultra-short helpful follow-up tip when relevant.' : ''
  }
${extraContextBlock}`;
}

function buildNovaSystemInstruction(params: {
  slangMirroring: boolean;
  proactiveMode: boolean;
  biometricVerified: boolean;
  deviceState: Record<string, unknown>;
  tasks: Array<Record<string, unknown>>;
  mobileIndex: Array<Record<string, unknown>>;
  adaptedCodes: Array<Record<string, unknown>>;
  extraContextBlock: string;
}): string {
  const {
    slangMirroring,
    proactiveMode,
    biometricVerified,
    deviceState,
    tasks,
    mobileIndex,
    adaptedCodes,
    extraContextBlock,
  } = params;
  const compactTasks = tasks.slice(0, 5).map((t) => `${t.title}(${t.dueTime})`);
  const compactVault = mobileIndex.slice(0, 6).map((m) => `${m.title}[${m.type}]`);
  const compactCodes = adaptedCodes.slice(0, 6).map((c) => `${c.code}:${c.description}`);
  return `You are Nova, an ultra-fast, accurate AI companion & Android phone assistant.
- Reply in the EXACT language of the user (unless overridden by Personalisation). ${
    slangMirroring ? "Mirror the user's tone and slang naturally." : 'Keep a crisp, warm human tone.'
  }
- Give the direct answer first, zero filler, verified accuracy, clean Markdown formatting.
${extraContextBlock}
- Device: wifi=${deviceState.wifi}, bt=${deviceState.bluetooth}, dnd=${deviceState.dnd}, bright=${deviceState.brightness}%, vol=${deviceState.volume}%, bio=${
    biometricVerified ? 'UNLOCKED' : 'LOCKED'
  }.
- Codes: ${compactCodes.join(' | ') || 'none'}
- Tasks: ${compactTasks.join('; ') || 'none'}
- Vault: ${compactVault.join(', ') || 'none'}
- Whenever the user asks to create, draw, paint, sketch, design, or generate ANY picture, image, photo, artwork, illustration, wallpaper, or poster, ALWAYS invoke \`generatePicture\` immediately with a rich visual prompt, optimal \`aspectRatio\`, and \`stylePreset\`. Only invoke \`generateVectorArt\` if the user explicitly asks for raw SVG markup or a simple vector diagram. Use \`generatePdfDocument\` for PDFs, \`setAlarm\` for alarms, \`controlDeviceSetting\` for phone controls, \`adaptCommandCode\` to save codes, \`generateQuickCommandKey\` to create a quick-command passkey, \`manageTask\` for tasks, \`searchMobileIndex\` for vault search, \`runSecurityAudit\` for virus scans, and \`suggestMemory\` when the user asks you to remember a preference or stable fact (requiring user approval).${
    proactiveMode ? ' Add at most 1 short proactive tip when useful.' : ''
  }`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'nova-server', apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

app.get('/api/nova/models-status', (_req, res) => {
  const avgLatencyMs =
    serverTelemetry.totalRequests > 0
      ? Math.round(serverTelemetry.totalLatencyMs / serverTelemetry.totalRequests)
      : 0;
  res.json({
    apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    activeModels: MODEL_CATALOG,
    metrics: {
      totalRequests: serverTelemetry.totalRequests,
      successCount: serverTelemetry.successCount,
      errorCount: serverTelemetry.errorCount,
      avgLatencyMs,
      perModelCalls: serverTelemetry.perModelCalls,
    },
    recentLogs: serverTelemetry.recentLogs,
  });
});

app.delete('/api/nova/logs', (_req, res) => {
  serverTelemetry.recentLogs.length = 0;
  res.json({ ok: true });
});

app.use(
  '/api/nova',
  createEcosystemRouter({
    getAiClient,
    tryGetAiClient,
    getGeminiErrorStatus,
    recordApiTelemetry,
  })
);

app.use(
  '/api/nova/languages',
  createLanguageRouter({
    getAiClient,
    getGeminiErrorStatus,
    recordApiTelemetry,
  })
);

app.use(
  '/api/nova/media-studio',
  createMediaStudioRouter({
    getAiClient,
    getGeminiErrorStatus,
    recordApiTelemetry,
  })
);

function buildChatFunctionDeclarations() {
  return [
    {
      functionDeclarations: [
        controlDeviceSettingDecl,
        setAlarmDecl,
        manageTaskDecl,
        searchMobileIndexDecl,
        runSecurityAuditDecl,
        generatePictureDecl,
        generateVectorArtDecl,
        generatePdfDocumentDecl,
        adaptCommandCodeDecl,
        generateQuickCommandKeyDecl,
        suggestMemoryDecl,
      ],
    },
  ];
}

function evaluateFunctionCalls(
  functionCalls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>,
  biometricVerified: boolean,
  mobileIndex: Array<Record<string, string>>
) {
  const executedActions: Array<{
    type: string;
    args: Record<string, unknown>;
    requiresBiometric: boolean;
    resultText: string;
  }> = [];
  const responseParts: Part[] = [];

  for (const fc of functionCalls) {
    const name = fc.name ?? '';
    const args = (fc.args ?? {}) as Record<string, unknown>;
    let requiresBiometric = false;
    let resultSummary = 'Executed.';

    if (name === 'controlDeviceSetting') {
      const setting = String(args.setting ?? '');
      const sensitive = ['location', 'airplaneMode'].includes(setting);
      if (sensitive && !biometricVerified) {
        requiresBiometric = true;
        resultSummary = `Fingerprint verification required to modify ${setting}.`;
      } else {
        resultSummary = `Updated ${setting} ${
          args.booleanValue !== undefined
            ? `to ${args.booleanValue ? 'ON' : 'OFF'}`
            : args.numericValue !== undefined
            ? `to ${args.numericValue}%`
            : args.appName
            ? `(${args.appName})`
            : ''
        }.`;
      }
    } else if (name === 'setAlarm') {
      resultSummary = `${args.action === 'cancel' ? 'Cancelled' : 'Set'} alarm for ${args.time}${
        args.label ? ` (${args.label})` : ''
      }.`;
    } else if (name === 'manageTask') {
      resultSummary = `Task '${args.action}' processed for "${args.title}".`;
    } else if (name === 'searchMobileIndex') {
      const q = String(args.query ?? '').toLowerCase();
      const scope = String(args.scope ?? 'all').toLowerCase();
      const matches = mobileIndex.filter((item) => {
        const scopeOk = scope === 'all' || item.type === scope;
        const hay = `${item.title} ${item.subtitle} ${item.contentPreview ?? ''}`.toLowerCase();
        return scopeOk && hay.includes(q);
      });
      resultSummary =
        matches.length > 0
          ? `Found ${matches.length} vault matches: ${matches
              .slice(0, 5)
              .map((m) => `${m.title} (${m.type})`)
              .join(', ')}.`
          : `No local vault items matched "${args.query}".`;
    } else if (name === 'runSecurityAudit') {
      resultSummary = `Started ${args.scanType} mobile security scan.`;
    } else if (name === 'generatePicture') {
      resultSummary = `Queued AI image generation for "${args.prompt}".`;
    } else if (name === 'generateVectorArt') {
      resultSummary = `Generated custom vector artwork for "${args.prompt}".`;
    } else if (name === 'generatePdfDocument') {
      resultSummary = `Prepared downloadable PDF "${args.title}" on "${args.topic}".`;
    } else if (name === 'adaptCommandCode') {
      resultSummary = `Adapted command code "${args.code}": ${args.description}.`;
    } else if (name === 'generateQuickCommandKey') {
      resultSummary = `Auto-generated Nova Command Passkey for "${args.label}".`;
    } else if (name === 'suggestMemory') {
      resultSummary = `Memory suggestion ready for approval: "${args.content}".`;
    }

    executedActions.push({
      type: name,
      args,
      requiresBiometric,
      resultText: resultSummary,
    });

    responseParts.push({
      functionResponse: {
        id: fc.id,
        name,
        response: { result: resultSummary },
      },
    });
  }

  return { executedActions, responseParts };
}

app.post('/api/nova/chat-stream', async (req, res) => {
  const startedAt = Date.now();
  req.socket?.setNoDelay?.(true);
  res.setTimeout?.(0);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  sendEvent('ready', { ok: true });

  let modelAttempted = 'gemini-4-hydrogen';

  try {
    const ai = getAiClient();
    const {
      messages = [],
      attachments = [],
      reasoningMode = 'fast',
      aiMode = 'normal',
      preferredModel = 'auto',
      personalisation = {},
      memories = [],
      conversationSummary = '',
      activeProject = null,
      activeSkills = [],
      deviceState = {},
      tasks = [],
      mobileIndex = [],
      adaptedCodes = [],
      slangMirroring = true,
      proactiveMode = true,
      biometricVerified = false,
    } = req.body ?? {};

    const trimmedHistory = (messages as Array<{ role: string; text: string }>).slice(-24);
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const contents: Content[] = trimmedHistory.map((m, idx) => {
      const isLastUser = idx === trimmedHistory.length - 1 && m.role === 'user';
      const parts: Part[] = [{ text: String(m.text ?? '') }];
      if (isLastUser && hasAttachments) {
        for (const att of attachments) {
          if (att?.dataBase64 && att?.mimeType) {
            parts.push({
              inlineData: {
                mimeType: String(att.mimeType),
                data: String(att.dataBase64),
              },
            });
          }
        }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const lastText = String(trimmedHistory[trimmedHistory.length - 1]?.text ?? '');
    const hasUrl = /https?:\/\/\S+/i.test(lastText);
    const useTools = needsPhoneOrCreativeTools(lastText, hasAttachments);
    const useSearch =
      reasoningMode !== 'turbo' &&
      (reasoningMode === 'deep' || aiMode === 'research' || needsWebSearch(lastText));
    const isComplexStem =
      needsDeepAccuracyReasoning(lastText) ||
      aiMode === 'developer' ||
      aiMode === 'expert' ||
      aiMode === 'problem_solver';

    const extraContextBlock = buildPersonalisationAndMemoryBlock({
      aiMode: String(aiMode),
      personalisation,
      memories,
      conversationSummary: String(conversationSummary ?? ''),
      activeProject,
      activeSkills,
    });

    const systemInstruction = useTools
      ? buildNovaSystemInstruction({
          slangMirroring,
          proactiveMode,
          biometricVerified,
          deviceState,
          tasks,
          mobileIndex,
          adaptedCodes,
          extraContextBlock,
        })
      : buildFastQASystemInstruction(Boolean(slangMirroring), Boolean(proactiveMode), extraContextBlock);

    const functionToolsOnly = useTools ? buildChatFunctionDeclarations() : [];
    const activeTools = useSearch
      ? [{ googleSearch: {} }, ...(hasUrl ? [{ urlContext: {} }] : []), ...functionToolsOnly]
      : functionToolsOnly;
    const toolConfigBlock =
      useSearch && activeTools.length > 0
        ? { toolConfig: { includeServerSideToolInvocations: true } }
        : {};

    const candidates = resolveChatModelCandidates(
      preferredModel,
      String(reasoningMode),
      useTools,
      useSearch,
      isComplexStem
    );

    const desiredLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' =
      reasoningMode === 'deep'
        ? useTools
          ? 'HIGH'
          : 'XHIGH'
        : reasoningMode === 'turbo' || (!useTools && !useSearch && !isComplexStem)
        ? 'MINIMAL'
        : isComplexStem
        ? 'MEDIUM'
        : 'LOW';

    const streamAttempts = candidates.map((modelId, idx) => ({
      model: modelId,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: getAllowedThinkingLevel(
            modelId,
            idx === 0 ? desiredLevel : idx === 1 ? 'LOW' : 'MINIMAL'
          ),
        },
        ...(idx === 0 && activeTools.length > 0
          ? { tools: activeTools, ...toolConfigBlock }
          : idx === 1 && functionToolsOnly.length > 0
          ? { tools: functionToolsOnly }
          : {}),
      },
    }));

    let fullText = '';
    const collectedFunctionCalls: Array<{
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }> = [];
    const collectedSources: Array<{ title: string; uri: string }> = [];
    let lastErr: unknown;

    for (let i = 0; i < streamAttempts.length; i++) {
      const attempt = streamAttempts[i];
      modelAttempted = attempt.model;
      try {
        const stream = await ai.models.generateContentStream({
          model: attempt.model,
          contents,
          config: attempt.config as never,
        });

        for await (const chunk of stream) {
          if (chunk.text) {
            fullText += chunk.text;
            sendEvent('delta', { text: chunk.text });
          }
          if (Array.isArray(chunk.functionCalls) && chunk.functionCalls.length > 0) {
            collectedFunctionCalls.push(
              ...(chunk.functionCalls as Array<{
                id?: string;
                name?: string;
                args?: Record<string, unknown>;
              }>)
            );
          }
          const chunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          for (const g of chunks) {
            if (g.web?.uri && !collectedSources.some((s) => s.uri === g.web?.uri)) {
              collectedSources.push({
                title: g.web.title || g.web.uri,
                uri: g.web.uri,
              });
            }
          }
        }
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        if (isModelFallbackError(err) && i < streamAttempts.length - 1) {
          recordApiTelemetry(
            '/api/nova/chat-stream',
            attempt.model,
            429,
            Date.now() - startedAt,
            false,
            `Falling back after error: ${err instanceof Error ? err.message : String(err)}`
          );
          await sleep(180 * (i + 1));
          continue;
        }
        throw err;
      }
    }

    if (lastErr) throw lastErr;

    let executedActions: Array<{
      type: string;
      args: Record<string, unknown>;
      requiresBiometric: boolean;
      resultText: string;
    }> = [];

    if (collectedFunctionCalls.length > 0) {
      const evaluated = evaluateFunctionCalls(
        collectedFunctionCalls,
        Boolean(biometricVerified),
        mobileIndex as Array<Record<string, string>>
      );
      executedActions = evaluated.executedActions;
      sendEvent('actions', { actions: executedActions });

      if (!fullText.trim()) {
        const hasSearchVault = executedActions.some((a) => a.type === 'searchMobileIndex');
        if (hasSearchVault) {
          try {
            const quickConfirm = await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: `Summarize these tool results concisely in the same language as "${lastText}": ${executedActions
                .map((a) => a.resultText)
                .join(' ')}`,
              config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
            });
            fullText = quickConfirm.text ?? executedActions.map((a) => a.resultText).join(' ');
          } catch {
            fullText = executedActions.map((a) => a.resultText).join(' ');
          }
        } else {
          fullText = executedActions.map((a) => a.resultText).join(' ');
        }
        sendEvent('delta', { text: fullText });
      }
    }

    recordApiTelemetry(
      '/api/nova/chat-stream',
      modelAttempted,
      200,
      Date.now() - startedAt,
      true,
      `Streamed ${fullText.length} chars (${aiMode})`
    );

    sendEvent('done', {
      text: fullText || 'Done — updated for you.',
      actions: executedActions,
      sources: collectedSources,
      modelUsed: modelAttempted,
    });
    res.end();
  } catch (err) {
    const { status, message, paidKeyRequired } = getGeminiErrorStatus(err);
    recordApiTelemetry(
      '/api/nova/chat-stream',
      modelAttempted,
      status,
      Date.now() - startedAt,
      false,
      message
    );
    if (status === 429 || status === 402) {
      console.warn(`[/api/nova/chat-stream] ${status}: ${message}`);
    } else {
      console.error('Error in /api/nova/chat-stream:', err);
    }
    sendEvent('error', { error: message, status, paidKeyRequired });
    res.end();
  }
});

app.post('/api/nova/chat', async (req, res) => {
  const startedAt = Date.now();
  let modelUsed = 'gemini-4-hydrogen';
  try {
    const ai = getAiClient();
    const {
      messages = [],
      attachments = [],
      reasoningMode = 'fast',
      aiMode = 'normal',
      preferredModel = 'auto',
      personalisation = {},
      memories = [],
      conversationSummary = '',
      activeProject = null,
      activeSkills = [],
      deviceState = {},
      tasks = [],
      mobileIndex = [],
      adaptedCodes = [],
      slangMirroring = true,
      proactiveMode = true,
      biometricVerified = false,
    } = req.body ?? {};

    const trimmedHistory = (messages as Array<{ role: string; text: string }>).slice(-24);
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const contents: Content[] = trimmedHistory.map((m, idx) => {
      const isLastUser = idx === trimmedHistory.length - 1 && m.role === 'user';
      const parts: Part[] = [{ text: String(m.text ?? '') }];
      if (isLastUser && hasAttachments) {
        for (const att of attachments) {
          if (att?.dataBase64 && att?.mimeType) {
            parts.push({
              inlineData: {
                mimeType: String(att.mimeType),
                data: String(att.dataBase64),
              },
            });
          }
        }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const lastText = String(trimmedHistory[trimmedHistory.length - 1]?.text ?? '');
    const hasUrl = /https?:\/\/\S+/i.test(lastText);
    const useTools = needsPhoneOrCreativeTools(lastText, hasAttachments);
    const useSearch =
      reasoningMode !== 'turbo' &&
      (reasoningMode === 'deep' || aiMode === 'research' || needsWebSearch(lastText));
    const isComplexStem =
      needsDeepAccuracyReasoning(lastText) ||
      aiMode === 'developer' ||
      aiMode === 'expert' ||
      aiMode === 'problem_solver';

    const extraContextBlock = buildPersonalisationAndMemoryBlock({
      aiMode: String(aiMode),
      personalisation,
      memories,
      conversationSummary: String(conversationSummary ?? ''),
      activeProject,
      activeSkills,
    });

    const systemInstruction = useTools
      ? buildNovaSystemInstruction({
          slangMirroring,
          proactiveMode,
          biometricVerified,
          deviceState,
          tasks,
          mobileIndex,
          adaptedCodes,
          extraContextBlock,
        })
      : buildFastQASystemInstruction(Boolean(slangMirroring), Boolean(proactiveMode), extraContextBlock);

    const functionToolsOnly = useTools ? buildChatFunctionDeclarations() : [];
    const activeTools = useSearch
      ? [{ googleSearch: {} }, ...(hasUrl ? [{ urlContext: {} }] : []), ...functionToolsOnly]
      : functionToolsOnly;
    const toolConfigBlock =
      useSearch && activeTools.length > 0
        ? { toolConfig: { includeServerSideToolInvocations: true } }
        : {};

    const candidates = resolveChatModelCandidates(
      preferredModel,
      String(reasoningMode),
      useTools,
      useSearch,
      isComplexStem
    );
    const desiredLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' =
      reasoningMode === 'deep'
        ? useTools
          ? 'HIGH'
          : 'XHIGH'
        : reasoningMode === 'turbo' || (!useTools && !useSearch && !isComplexStem)
        ? 'MINIMAL'
        : 'LOW';

    const attempts = candidates.map((modelId, idx) => ({
      model: modelId,
      contents,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: getAllowedThinkingLevel(
            modelId,
            idx === 0 ? desiredLevel : idx === 1 ? 'LOW' : 'MINIMAL'
          ),
        },
        ...(idx === 0 && activeTools.length > 0
          ? { tools: activeTools, ...toolConfigBlock }
          : idx === 1 && functionToolsOnly.length > 0
          ? { tools: functionToolsOnly }
          : {}),
      },
    }));

    const { response: response1, modelUsed: actualModel } = await generateWithResilience(
      ai,
      attempts
    );
    modelUsed = actualModel;

    const functionCalls = (response1.functionCalls ?? []) as Array<{
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }>;
    let finalText = response1.text ?? '';
    const finalCandidate = response1.candidates?.[0];

    const { executedActions } =
      functionCalls.length > 0
        ? evaluateFunctionCalls(
            functionCalls,
            Boolean(biometricVerified),
            mobileIndex as Array<Record<string, string>>
          )
        : { executedActions: [] };

    if (executedActions.length > 0 && !finalText.trim()) {
      finalText = executedActions.map((a) => a.resultText).join(' ');
    }

    const groundingChunks = finalCandidate?.groundingMetadata?.groundingChunks ?? [];
    const sources: Array<{ title: string; uri: string }> = [];
    for (const chunk of groundingChunks) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || chunk.web.uri,
          uri: chunk.web.uri,
        });
      }
    }

    recordApiTelemetry(
      '/api/nova/chat',
      modelUsed,
      200,
      Date.now() - startedAt,
      true,
      `Replied ${finalText.length} chars (${aiMode})`
    );

    res.json({
      text: finalText || 'Done — updated for you.',
      actions: executedActions,
      sources,
      modelUsed,
    });
  } catch (err) {
    const { status, message, paidKeyRequired } = getGeminiErrorStatus(err);
    recordApiTelemetry('/api/nova/chat', modelUsed, status, Date.now() - startedAt, false, message);
    if (status === 429 || status === 402) {
      console.warn(`[/api/nova/chat] ${status}: ${message}`);
    } else {
      console.error('Error in /api/nova/chat:', err);
    }
    res.status(status).json({ error: message, ...(paidKeyRequired ? { paidKeyRequired } : {}) });
  }
});

app.post('/api/nova/generate-vector-art', async (req, res) => {
  try {
    const ai = getAiClient();
    const { prompt, aspectRatio = '1:1' } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Missing art prompt.' });
      return;
    }

    const [w, h] =
      aspectRatio === '16:9'
        ? [1280, 720]
        : aspectRatio === '9:16'
        ? [720, 1280]
        : aspectRatio === '4:3'
        ? [1024, 768]
        : aspectRatio === '3:4'
        ? [768, 1024]
        : [1024, 1024];

    const svgPrompt = `Create an artistic, richly detailed layered vector illustration SVG (viewBox="0 0 ${w} ${h}" width="${w}" height="${h}") depicting: "${prompt}".
Rules:
- Return ONLY raw valid <svg>...</svg> markup (no markdown fences, no commentary).
- Use rich atmospheric gradients (<defs>, <radialGradient>, <linearGradient>), glowing lighting accents, clear recognizable subject geometry, foreground/midground/background depth layers, and zero <script> or on* event handlers.
- Do not leave empty backgrounds; make the composition vibrant and complete.`;

    const { response } = await generateWithResilience(ai, [
      {
        model: 'gemini-4-hydrogen',
        contents: svgPrompt,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      },
      {
        model: 'gemini-3.1-flash-lite',
        contents: svgPrompt,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
      },
    ]);

    const raw = (response.text ?? '')
      .replace(/```(?:svg|xml)?/gi, '')
      .replace(/```/g, '')
      .trim();
    const svgStart = raw.indexOf('<svg');
    const svgEnd = raw.lastIndexOf('</svg>');
    if (svgStart === -1 || svgEnd === -1) {
      res.status(502).json({ error: 'Could not compose SVG artwork.' });
      return;
    }
    const svgMarkup = raw
      .slice(svgStart, svgEnd + 6)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '');

    res.json({ svgMarkup, modelUsed: 'gemini-4-hydrogen' });
  } catch (err) {
    const { status, message } = getGeminiErrorStatus(err);
    console.warn(`[/api/nova/generate-vector-art] ${status}: ${message}`);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/generate-image', async (req, res) => {
  try {
    const ai = getAiClient('v1beta');
    const {
      prompt,
      aspectRatio = '1:1',
      imageSize = '2K',
      quality = 'pro',
      stylePreset = 'auto',
      sourceImageBase64,
      sourceMimeType = 'image/png',
    } = req.body ?? {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'Missing image prompt.' });
      return;
    }

    const safeAspect = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:1', '1:4'].includes(
      String(aspectRatio)
    )
      ? String(aspectRatio)
      : '1:1';
    const safeSize = ['1K', '2K', '4K'].includes(String(imageSize)) ? String(imageSize) : '2K';
    const styleNote =
      stylePreset && stylePreset !== 'auto'
        ? ` Visual direction: ${String(stylePreset).replace(/_/g, ' ')} style with crisp textures, rich lighting, natural depth, and sharp focus.`
        : '';
    const finalPrompt = `${prompt.trim()}${styleNote}`.slice(0, 2400);

    const baseParts: Part[] = [];
    if (sourceImageBase64 && typeof sourceImageBase64 === 'string') {
      const cleanData = sourceImageBase64.replace(/^data:[^;]+;base64,/, '');
      const matchedMime =
        sourceImageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/)?.[1] ||
        String(sourceMimeType || 'image/png');
      baseParts.push({
        inlineData: {
          mimeType: matchedMime,
          data: cleanData,
        },
      });
    }
    baseParts.push({ text: finalPrompt });

    const needsPro =
      quality === 'pro' ||
      safeSize === '2K' ||
      safeSize === '4K' ||
      safeAspect === '3:2' ||
      safeAspect === '2:3' ||
      safeAspect === '4:1' ||
      safeAspect === '1:4';

    const modelCandidates = needsPro
      ? ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image']
      : ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1'];

    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let modelUsed = modelCandidates[0];
    let lastErr: unknown = null;

    for (const candidateModel of modelCandidates) {
      const isProCandidate = candidateModel === 'gemini-nano-banana-2.1';
      const effectiveAspect =
        !isProCandidate && ['3:2', '2:3', '4:1', '1:4'].includes(safeAspect)
          ? safeAspect === '3:2' || safeAspect === '4:1'
            ? '16:9'
            : '9:16'
          : safeAspect;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: candidateModel,
            contents: { parts: baseParts },
            config: {
              imageConfig: {
                aspectRatio: effectiveAspect,
                ...(isProCandidate ? { imageSize: safeSize } : {}),
              },
            },
          });
          modelUsed = candidateModel;
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isTransient =
            msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('500');
          if (isTransient && attempt === 0) {
            await new Promise((r) => setTimeout(r, 450));
            continue;
          }
          const shouldTryNextModel =
            msg.includes('NOT_FOUND') ||
            msg.includes('404') ||
            msg.includes('INVALID_ARGUMENT') ||
            isTransient;
          if (!shouldTryNextModel) throw err;
          break;
        }
      }
      if (response) break;
    }

    if (!response) {
      throw lastErr || new Error('Gemini image generation failed.');
    }

    let rawBase64 = '';
    let detectedMime = 'image/png';
    let caption = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data && !rawBase64) {
        rawBase64 = part.inlineData.data;
        detectedMime = part.inlineData.mimeType || 'image/png';
      } else if (part.text) {
        caption += part.text;
      }
    }

    if (!rawBase64) {
      res.status(502).json({ error: 'No image bytes returned by Gemini image generator.' });
      return;
    }

    const byteLength = Buffer.from(rawBase64, 'base64').byteLength;
    const imageDataUrl = `data:${detectedMime};base64,${rawBase64}`;

    res.json({
      imageDataUrl,
      mimeType: detectedMime,
      byteLength,
      caption: caption.trim(),
      modelUsed,
      aspectRatio: safeAspect,
      imageSize: modelUsed === 'gemini-nano-banana-2.1' ? safeSize : '1K',
    });
  } catch (err) {
    const { status, message, paidKeyRequired } = getGeminiErrorStatus(err);
    if (status === 429 || status === 402) {
      console.warn(`[/api/nova/generate-image] ${status}: ${message}`);
    } else {
      console.error('Error in /api/nova/generate-image:', err);
    }
    res.status(status).json({ error: message, ...(paidKeyRequired ? { paidKeyRequired } : {}) });
  }
});

app.post('/api/nova/generate-pdf-content', async (req, res) => {
  try {
    const ai = getAiClient();
    const { topic, title, tone = 'professional', existingText = '' } = req.body ?? {};
    if (!topic || typeof topic !== 'string') {
      res.status(400).json({ error: 'Missing PDF topic.' });
      return;
    }

    const prompt = existingText
      ? `Transform and expand this existing document content according to the request "${topic}". Tone: ${tone}.\n\nExisting content:\n${existingText}`
      : `Write a comprehensive, cleanly structured multi-section document on the topic: "${topic}".${
          title ? ` Preferred title: "${title}".` : ''
        } Tone: ${tone}. Include practical details, clear section headings, substantive paragraphs, and crisp bullet points.`;

    const config = {
      systemInstruction:
        'You are Nova Document Studio. Produce rich, accurate, well-structured document content ready for PDF export.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          author: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                paragraphs: { type: Type.ARRAY, items: { type: Type.STRING } },
                bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['heading', 'paragraphs'],
            },
          },
        },
        required: ['title', 'subtitle', 'sections'],
      },
    };

    const { response } = await generateWithResilience(ai, [
      { model: 'gemini-4-hydrogen', contents: prompt, config },
      { model: 'gemini-3.1-flash-lite', contents: prompt, config },
    ]);

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Error in /api/nova/generate-pdf-content:', err);
    const { status, message } = getGeminiErrorStatus(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/review', async (req, res) => {
  try {
    const ai = getAiClient();
    const {
      contentText = '',
      attachmentBase64,
      attachmentMimeType,
      fileName = 'Document',
      reviewFocus = 'clarity, accuracy, structure, and completeness',
    } = req.body ?? {};

    if (!contentText.trim() && !attachmentBase64) {
      res.status(400).json({ error: 'Provide text, code, or upload a PDF/file to review.' });
      return;
    }

    const parts: Part[] = [];
    if (attachmentBase64 && attachmentMimeType) {
      parts.push({
        inlineData: {
          mimeType: String(attachmentMimeType),
          data: String(attachmentBase64).replace(/^data:[^;]+;base64,/, ''),
        },
      });
    }
    parts.push({
      text: `Perform an expert, thorough review of "${fileName}". Focus areas: ${reviewFocus}.\n${
        contentText ? `\nContent:\n${contentText}` : ''
      }`,
    });

    const config = {
      systemInstruction:
        'You are Nova Expert Reviewer. Critically review documents, PDFs, essays, contracts, or code. Provide an honest readiness score (0-100), concrete strengths, actionable issues, and a polished improvedDraft.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallAssessment: { type: Type.STRING },
          readinessScore: { type: Type.NUMBER },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          issues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                severity: { type: Type.STRING, description: 'high, medium, or low' },
                location: { type: Type.STRING },
                detail: { type: Type.STRING },
                suggestion: { type: Type.STRING },
              },
              required: ['severity', 'location', 'detail', 'suggestion'],
            },
          },
          improvedDraft: { type: Type.STRING },
        },
        required: ['overallAssessment', 'readinessScore', 'strengths', 'issues', 'improvedDraft'],
      },
    };

    const { response } = await generateWithResilience(ai, [
      { model: 'gemini-4-hydrogen', contents: { parts }, config },
      { model: 'gemini-3.1-flash-lite', contents: { parts }, config },
    ]);

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Error in /api/nova/review:', err);
    const { status, message } = getGeminiErrorStatus(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/generate-music', async (req, res) => {
  try {
    const ai = getAiClient('v1alpha');
    const { prompt } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Missing music prompt.' });
      return;
    }

    const response = await ai.models.generateContentStream({
      model: 'lyria-3-clip-preview',
      contents: prompt,
    });

    const audioChunks: Buffer[] = [];
    let lyrics = '';
    let mimeType = 'audio/mpeg';

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (audioChunks.length === 0 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
        }
        if (part.text) {
          lyrics += part.text;
        }
      }
    }

    if (audioChunks.length === 0) {
      res.status(502).json({ error: 'No music audio returned.' });
      return;
    }

    const audioBase64 = Buffer.concat(audioChunks).toString('base64');
    res.json({
      audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
      lyrics: lyrics.trim(),
    });
  } catch (err) {
    const { status, message, paidKeyRequired } = getGeminiErrorStatus(err);
    if (status === 429 || status === 402) {
      console.warn(`[/api/nova/generate-music] ${status}: ${message}`);
    } else {
      console.error('Error in /api/nova/generate-music:', err);
    }
    res.status(status).json({ error: message, ...(paidKeyRequired ? { paidKeyRequired } : {}) });
  }
});

app.post('/api/nova/media-library', async (req, res) => {
  try {
    const { query, mediaType = 'audio' } = req.body ?? {};
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Missing media search query.' });
      return;
    }

    const typeFilter = mediaType === 'movies' ? 'movies' : 'audio';
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      `(${query}) AND mediatype:(${typeFilter})`
    )}&fl[]=identifier,title,creator,year,description&rows=6&page=1&output=json`;

    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) {
      throw new Error('Public media archive search failed.');
    }
    const searchJson = (await searchResp.json()) as {
      response?: {
        docs?: Array<{
          identifier: string;
          title?: string;
          creator?: string | string[];
          year?: string;
          description?: string | string[];
        }>;
      };
    };

    const docs = searchJson.response?.docs ?? [];
    const results: Array<{
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
    }> = [];

    for (const doc of docs.slice(0, 5)) {
      try {
        const metaResp = await fetch(`https://archive.org/metadata/${doc.identifier}/files`);
        if (!metaResp.ok) continue;
        const metaJson = (await metaResp.json()) as {
          result?: Array<{ name: string; format?: string }>;
        };
        const files = metaJson.result ?? [];
        const targetExt = typeFilter === 'movies' ? ['.mp4', '.ogv', '.webm'] : ['.mp3', '.ogg', '.wav'];
        const chosen = files.find((f) =>
          targetExt.some((ext) => f.name.toLowerCase().endsWith(ext))
        );
        if (!chosen) continue;

        const fileUrl = `https://archive.org/download/${doc.identifier}/${encodeURIComponent(
          chosen.name
        )}`;
        results.push({
          id: doc.identifier,
          title: doc.title || doc.identifier,
          creator: Array.isArray(doc.creator)
            ? doc.creator.join(', ')
            : doc.creator || 'Public Domain Archive',
          mediaType: typeFilter,
          year: doc.year,
          description: Array.isArray(doc.description)
            ? doc.description[0]?.slice(0, 140)
            : doc.description?.slice(0, 140),
          streamUrl: fileUrl,
          downloadUrl: fileUrl,
          fileName: chosen.name,
          archivePageUrl: `https://archive.org/details/${doc.identifier}`,
        });
      } catch {
        // skip item if metadata lookup fails
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('Error in /api/nova/media-library:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unable to fetch open-licensed media.',
    });
  }
});

app.post('/api/nova/transcribe', async (req, res) => {
  try {
    const ai = getAiClient();
    const { audioBase64, mimeType = 'audio/webm' } = req.body ?? {};
    if (!audioBase64) {
      res.status(400).json({ error: 'Missing audioBase64 payload.' });
      return;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          {
            text: 'Transcribe this speech verbatim in its original language, dialect, and slang. Return only the transcribed text.',
          },
        ],
      },
    });

    res.json({ text: (response.text ?? '').trim() });
  } catch (err) {
    console.error('Error in /api/nova/transcribe:', err);
    const { status, message } = getGeminiErrorStatus(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/speak', async (req, res) => {
  try {
    const {
      text,
      voiceName = 'Kore',
      style = 'Warm, expressive, human personal assistant',
    } = req.body ?? {};
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Missing text for speech synthesis.' });
      return;
    }

    const trimmed = text.slice(0, 700);
    const ttsAttempts = [
      { apiVersion: 'v1alpha', withMetadata: true },
      { apiVersion: 'v1beta', withMetadata: true },
      { apiVersion: 'v1beta', withMetadata: false },
      { apiVersion: 'v1alpha', withMetadata: false },
    ];

    let response;
    let lastErr: unknown;

    for (const attempt of ttsAttempts) {
      try {
        const ttsAi = getAiClient(attempt.apiVersion);
        response = await ttsAi.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                attempt.withMetadata
                  ? { text: trimmed, speechMetadata: { style } }
                  : { text: `${style}: ${trimmed}` },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('INVALID_ARGUMENT') || msg.includes('400')) {
          continue;
        }
        throw err;
      }
    }

    if (!response) {
      throw lastErr || new Error('Speech synthesis failed.');
    }

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(502).json({ error: 'No audio returned from speech synthesizer.' });
      return;
    }

    res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
  } catch (err) {
    console.error('Error in /api/nova/speak:', err);
    const { status, message } = getGeminiErrorStatus(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/search', async (req, res) => {
  try {
    const ai = getAiClient();
    const { query } = req.body ?? {};
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Missing search query.' });
      return;
    }

    const { response } = await generateWithResilience(ai, [
      { model: 'gemini-4-hydrogen', contents: { parts: [{ text: query }] }, config: { systemInstruction: 'You are Nova Search, a crisp mobile search engine. Answer in the exact language of the query with direct, accurate facts and clear formatting.', tools: [{ googleSearch: {} }] } },
      { model: 'gemini-3.1-flash-lite', contents: query, config: { systemInstruction: 'You are Nova Search, a crisp mobile search engine. Answer in the exact language of the query with direct, accurate facts and clear formatting.' } },
    ]);

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: Array<{ title: string; uri: string }> = [];
    for (const chunk of groundingChunks) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || chunk.web.uri,
          uri: chunk.web.uri,
        });
      }
    }

    res.json({
      answer: response.text ?? '',
      sources,
    });
  } catch (err) {
    console.error('Error in /api/nova/search:', err);
    const { status, message } = getGeminiErrorStatus(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/security-analyze', async (req, res) => {
  try {
    const ai = getAiClient();
    const { input, auditSnapshot } = req.body ?? {};
    if (!input || typeof input !== 'string') {
      res.status(400).json({ error: 'Missing input to analyze.' });
      return;
    }

    const prompt = `Analyze this mobile security artifact (could be an SMS/message, URL, APK package name, or file/permission report) for malware, phishing, spyware, or privacy abuse:\n\nArtifact: ${input}\n\nDevice Audit Snapshot: ${JSON.stringify(
      auditSnapshot ?? []
    )}`;

    const config = {
      systemInstruction:
        'You are Nova Security Shield, an expert Android mobile threat & virus analyst. Provide an accurate, practical verdict.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verdict: {
            type: Type.STRING,
            description: 'Must be exactly one of: safe, caution, threat',
          },
          summary: {
            type: Type.STRING,
            description: 'Concise 1-2 sentence explanation of findings.',
          },
          indicators: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-4 specific technical or behavioral indicators found.',
          },
          recommendedAction: {
            type: Type.STRING,
            description: 'Clear next step for the user.',
          },
        },
        required: ['verdict', 'summary', 'indicators', 'recommendedAction'],
      },
    };

    const { response } = await generateWithResilience(ai, [
      { model: 'gemini-4-hydrogen', contents: prompt, config },
      { model: 'gemini-3.1-flash-lite', contents: prompt, config },
    ]);

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Error in /api/nova/security-analyze:', err);
    const { status, message } = getGeminiErrorStatus(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/proactive-brief', async (req, res) => {
  try {
    const ai = getAiClient();
    const { tasks = [], deviceState = {}, localTime = '' } = req.body ?? {};
    const prompt = `Local time: ${localTime}. Pending tasks: ${JSON.stringify(
      tasks
    )}. Device state: ${JSON.stringify(
      deviceState
    )}. Write a warm, 2-sentence proactive companion check-in recommending the single smartest thing to tackle next or a helpful setting adjustment.`;
    const config = {
      systemInstruction:
        'You are Nova, a proactive human-like mobile companion. Keep it ultra-concise (max 35 words), warm, and actionable.',
    };

    const { response } = await generateWithResilience(ai, [
      { model: 'gemini-4-hydrogen', contents: prompt, config },
      { model: 'gemini-3.1-flash-lite', contents: prompt, config },
    ]);
    res.json({ brief: (response.text ?? '').trim() });
  } catch (err) {
    console.error('Error in /api/nova/proactive-brief:', err);
    const { status, message } = getGeminiErrorStatus(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/test-connection', async (req, res) => {
  const startedAt = Date.now();
  const requestedModel =
    typeof req.body?.model === 'string' && MODEL_CATALOG.some((m) => m.id === req.body.model)
      ? req.body.model
      : 'gemini-4-hydrogen';

  try {
    const ai = getAiClient();
    const candidates = Array.from(
      new Set([requestedModel, 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'])
    );
    const attempts = candidates.map((m) => ({
      model: m,
      contents: 'Reply cleanly with exactly: NOVA_ONLINE_OK',
      config: {
        thinkingConfig: { thinkingLevel: getAllowedThinkingLevel(m, 'MINIMAL') },
      },
    }));

    const { response, modelUsed } = await generateWithResilience(ai, attempts);
    const latencyMs = Date.now() - startedAt;
    const fallbackUsed = modelUsed !== requestedModel;
    recordApiTelemetry(
      '/api/nova/test-connection',
      modelUsed,
      200,
      latencyMs,
      true,
      fallbackUsed
        ? `Connected via fallback ${modelUsed} (requested ${requestedModel})`
        : `Connection verified for ${modelUsed}`
    );

    res.json({
      ok: true,
      testedModel: requestedModel,
      actualModel: modelUsed,
      fallbackUsed,
      latencyMs,
      reply: (response.text ?? '').trim(),
    });
  } catch (err) {
    const { status, message } = getGeminiErrorStatus(err);
    const latencyMs = Date.now() - startedAt;
    recordApiTelemetry('/api/nova/test-connection', requestedModel, status, latencyMs, false, message);
    res.status(status).json({ ok: false, testedModel: requestedModel, latencyMs, error: message });
  }
});

app.post('/api/nova/summarize', async (req, res) => {
  const startedAt = Date.now();
  let modelUsed = 'gemini-3.1-flash-lite';
  try {
    const ai = getAiClient();
    const { messages = [] } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Provide messages to summarize.' });
      return;
    }

    const transcript = (messages as Array<{ role: string; text: string }>)
      .slice(-30)
      .map((m) => `${m.role === 'user' ? 'User' : 'Nova'}: ${String(m.text ?? '').slice(0, 800)}`)
      .join('\n\n');

    const config = {
      systemInstruction:
        'Summarize the conversation cleanly. Return a concise 3-6 word chat title and a crisp bulleted/paragraph context summary preserving decisions, code topics, and preferences.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
        required: ['title', 'summary'],
      },
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    };

    const out = await generateWithResilience(ai, [
      { model: 'gemini-3.1-flash-lite', contents: transcript, config },
      { model: 'gemini-4-hydrogen', contents: transcript, config },
    ]);
    modelUsed = out.modelUsed;

    const parsed = JSON.parse((out.response.text ?? '{}').trim());
    recordApiTelemetry(
      '/api/nova/summarize',
      modelUsed,
      200,
      Date.now() - startedAt,
      true,
      `Summarized ${messages.length} turns`
    );
    res.json({
      title: String(parsed.title || 'Nova Conversation').slice(0, 60),
      summary: String(parsed.summary || '').trim(),
      modelUsed,
    });
  } catch (err) {
    const { status, message } = getGeminiErrorStatus(err);
    recordApiTelemetry('/api/nova/summarize', modelUsed, status, Date.now() - startedAt, false, message);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/dev-assist', async (req, res) => {
  const startedAt = Date.now();
  let modelUsed = 'gemini-4-hydrogen';
  try {
    const ai = getAiClient();
    const {
      action = 'generate',
      language = 'TypeScript',
      prompt = '',
      code = '',
      projectFiles = [],
      preferredModel = 'auto',
    } = req.body ?? {};

    const filesList = Array.isArray(projectFiles) ? projectFiles.slice(0, 24) : [];
    const totalFilesContext = filesList
      .map(
        (f: { path?: string; name?: string; content?: string }) =>
          `### File: ${f.path || f.name || 'untitled'}\n\`\`\`\n${String(f.content ?? '').slice(
            0,
            6000
          )}\n\`\`\``
      )
      .join('\n\n')
      .slice(0, 48000);

    if (!String(prompt).trim() && !String(code).trim() && filesList.length === 0) {
      res.status(400).json({ error: 'Provide a task description, code snippet, or project files.' });
      return;
    }

    const actionGuides: Record<string, string> = {
      generate: `Generate clean, idiomatic, production-ready ${language} code solving the prompt. Include error handling, types, and brief usage notes.`,
      debug: `Inspect the ${language} code & prompt, list exact bugs/root causes, explain why each happens, and provide the complete corrected code.`,
      explain: `Explain the ${language} architecture, control flow, complexity, and non-obvious edge cases clearly.`,
      optimize: `Optimize the ${language} code for latency, memory, algorithmic complexity, and maintainability. Compare before vs. after briefly and output complete optimized code.`,
      'analyze-directory': `Analyze the uploaded multi-file codebase/directory structure. Map how modules connect, spot cross-file bugs, security risks, or missing imports, and propose concrete improvements with file paths.`,
    };

    const userContent = [
      `Requested Action: ${actionGuides[String(action)] ?? actionGuides.generate}`,
      `Primary Language / Stack: ${language}`,
      prompt ? `\nUser Instructions:\n${String(prompt)}` : '',
      code ? `\nSource Code Snippet:\n\`\`\`${language.toLowerCase()}\n${String(code)}\n\`\`\`` : '',
      totalFilesContext ? `\nProject Directory Files (${filesList.length}):\n${totalFilesContext}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const candidates = resolveChatModelCandidates(
      preferredModel,
      'deep',
      false,
      false,
      true
    );

    const out = await generateWithResilience(
      ai,
      candidates.map((m, idx) => ({
        model: m,
        contents: userContent,
        config: {
          systemInstruction:
            'You are Nova Developer Studio, a principal full-stack & systems engineer. Produce accurate, clean Markdown with properly tagged code blocks. Never fabricate library APIs.',
          thinkingConfig: {
            thinkingLevel: getAllowedThinkingLevel(m, idx === 0 ? 'HIGH' : 'LOW'),
          },
        },
      }))
    );

    modelUsed = out.modelUsed;
    const resultMarkdown = (out.response.text ?? '').trim();
    recordApiTelemetry(
      '/api/nova/dev-assist',
      modelUsed,
      200,
      Date.now() - startedAt,
      true,
      `${action} (${language}, ${filesList.length} files)`
    );
    res.json({ resultMarkdown, modelUsed });
  } catch (err) {
    const { status, message } = getGeminiErrorStatus(err);
    recordApiTelemetry('/api/nova/dev-assist', modelUsed, status, Date.now() - startedAt, false, message);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/agent/plan', async (req, res) => {
  const startedAt = Date.now();
  let modelUsed = 'gemini-4-hydrogen';
  try {
    const ai = getAiClient();
    const { objective = '', deviceState = {}, tasks = [], mobileIndex = [] } = req.body ?? {};
    if (!objective || typeof objective !== 'string' || !objective.trim()) {
      res.status(400).json({ error: 'Provide an objective for Nova Agent to plan.' });
      return;
    }

    const planPrompt = `Create a concrete 3-to-5 step autonomous execution plan for this user objective:
Objective: "${objective.trim()}"

Available tools:
- web_research: Search live web facts & verify up-to-date details (args: {"query": "..."})
- vault_search: Search user's on-device files/PDFs/notes/apps (args: {"query": "...", "scope": "all"})
- reason_analyze: Synthesize, compare, calculate, design, or draft structured output (args: {"instruction": "..."})
- generate_pdf: Create a downloadable PDF report/guide (args: {"title": "...", "topic": "...", "tone": "professional"})
- generate_art: Create custom visual illustration/wallpaper (args: {"prompt": "...", "aspectRatio": "1:1"})
- create_task: Add a task/reminder to user's schedule (args: {"action": "add", "title": "...", "dueTime": "Today", "priority": "medium", "category": "work"})
- set_alarm: Schedule an alarm (args: {"action": "set", "time": "07:30", "label": "..."})
- device_control: Adjust device toggle/slider (args: {"setting": "dnd|wifi|bluetooth|brightness|volume", "booleanValue": true})
- security_scan: Run device security audit (args: {"scanType": "quick"})

Context:
- Active tasks count: ${Array.isArray(tasks) ? tasks.length : 0}
- Vault items count: ${Array.isArray(mobileIndex) ? mobileIndex.length : 0}
- Device DND: ${Boolean((deviceState as Record<string, unknown>).dnd)}, Wi-Fi: ${Boolean((deviceState as Record<string, unknown>).wifi)}

Rules:
- Mark requiresConfirmation=true for any consequential action that changes device state, sets alarms, creates tasks, scans security, or generates saved artifacts (device_control, set_alarm, create_task, security_scan, generate_pdf, generate_art).
- Encode tool arguments cleanly in argsJson as a valid JSON string.`;

    const config = {
      systemInstruction:
        'You are Nova Autonomous Agent Planner. Decompose complex user goals into verifiable, ordered steps using the exact tool enum.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                tool: {
                  type: Type.STRING,
                  description:
                    'One of: web_research, vault_search, reason_analyze, generate_pdf, generate_art, create_task, set_alarm, device_control, security_scan',
                },
                argsJson: { type: Type.STRING },
                requiresConfirmation: { type: Type.BOOLEAN },
              },
              required: ['id', 'title', 'description', 'tool', 'argsJson', 'requiresConfirmation'],
            },
          },
        },
        required: ['steps'],
      },
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    };

    const out = await generateWithResilience(ai, [
      { model: 'gemini-4-hydrogen', contents: planPrompt, config },
      { model: 'gemini-3.1-flash-lite', contents: planPrompt, config },
    ]);
    modelUsed = out.modelUsed;

    const rawParsed = JSON.parse((out.response.text ?? '{}').trim()) as {
      steps?: Array<{
        id?: string;
        title?: string;
        description?: string;
        tool?: string;
        argsJson?: string;
        requiresConfirmation?: boolean;
      }>;
    };

    const CONSEQUENTIAL_TOOLS = new Set([
      'device_control',
      'set_alarm',
      'create_task',
      'security_scan',
      'generate_pdf',
      'generate_art',
    ]);

    const steps = (rawParsed.steps ?? []).slice(0, 6).map((s, idx) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(s.argsJson || '{}');
      } catch {
        parsedArgs = {};
      }
      const tool = String(s.tool || 'reason_analyze');
      return {
        id: s.id || `step-${idx + 1}`,
        title: String(s.title || `Step ${idx + 1}`),
        description: String(s.description || ''),
        tool,
        args: parsedArgs,
        requiresConfirmation: Boolean(s.requiresConfirmation) || CONSEQUENTIAL_TOOLS.has(tool),
        status: 'pending' as const,
      };
    });

    recordApiTelemetry(
      '/api/nova/agent/plan',
      modelUsed,
      200,
      Date.now() - startedAt,
      true,
      `Planned ${steps.length} steps`
    );
    res.json({ steps, modelUsed });
  } catch (err) {
    const { status, message } = getGeminiErrorStatus(err);
    recordApiTelemetry('/api/nova/agent/plan', modelUsed, status, Date.now() - startedAt, false, message);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/agent/step', async (req, res) => {
  const startedAt = Date.now();
  let modelUsed = 'gemini-4-hydrogen';
  try {
    const ai = getAiClient();
    const { objective = '', step = {}, priorResults = [] } = req.body ?? {};
    const tool = String((step as { tool?: string }).tool ?? 'reason_analyze');
    const stepArgs = ((step as { args?: Record<string, unknown> }).args ?? {}) as Record<
      string,
      unknown
    >;

    const prompt = `Overall Objective: ${objective}
Current Step: ${(step as { title?: string }).title ?? tool} — ${(step as { description?: string }).description ?? ''}
Tool Arguments: ${JSON.stringify(stepArgs)}
Prior Completed Step Outputs: ${JSON.stringify(priorResults).slice(0, 4000)}

Execute this analytical/research step now and produce a concise, accurate, verified result.`;

    const useWeb = tool === 'web_research';
    const out = await generateWithResilience(ai, [
      {
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are Nova Autonomous Agent Executor. Execute the current step accurately, concisely, and factually without inventing unverified facts.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          ...(useWeb ? { tools: [{ googleSearch: {} }] } : {}),
        },
      },
      {
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
    ]);

    modelUsed = out.modelUsed;
    const groundingChunks = out.response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: Array<{ title: string; uri: string }> = [];
    for (const chunk of groundingChunks) {
      if (chunk.web?.uri) {
        sources.push({ title: chunk.web.title || chunk.web.uri, uri: chunk.web.uri });
      }
    }

    recordApiTelemetry(
      '/api/nova/agent/step',
      modelUsed,
      200,
      Date.now() - startedAt,
      true,
      `Executed ${tool}`
    );
    res.json({ result: (out.response.text ?? 'Completed step.').trim(), sources, modelUsed });
  } catch (err) {
    const { status, message } = getGeminiErrorStatus(err);
    recordApiTelemetry('/api/nova/agent/step', modelUsed, status, Date.now() - startedAt, false, message);
    res.status(status).json({ error: message });
  }
});

app.post('/api/nova/agent/finalize', async (req, res) => {
  const startedAt = Date.now();
  let modelUsed = 'gemini-4-hydrogen';
  try {
    const ai = getAiClient();
    const { objective = '', steps = [] } = req.body ?? {};
    const prompt = `Objective: ${objective}
Executed Steps Summary: ${JSON.stringify(steps).slice(0, 8000)}

Verify whether all critical steps succeeded, note any skipped or failed items honestly, and write a clear, actionable final report in Markdown.`;

    const out = await generateWithResilience(ai, [
      {
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are Nova Autonomous Agent Verifier. Synthesize verified execution results honestly and crisply.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      {
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
      },
    ]);
    modelUsed = out.modelUsed;
    recordApiTelemetry(
      '/api/nova/agent/finalize',
      modelUsed,
      200,
      Date.now() - startedAt,
      true,
      'Verified final agent report'
    );
    res.json({ report: (out.response.text ?? '').trim(), modelUsed });
  } catch (err) {
    const { status, message } = getGeminiErrorStatus(err);
    recordApiTelemetry('/api/nova/agent/finalize', modelUsed, status, Date.now() - startedAt, false, message);
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        ...(disableHmr ? { hmr: false } : { hmr: { server: httpServer } }),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  startBackendScheduler(tryGetAiClient);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Nova server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
