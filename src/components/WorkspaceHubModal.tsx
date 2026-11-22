import React, { useEffect, useState } from 'react';
import {
  Activity,
  Brain,
  Check,
  Cpu,
  Edit3,
  Plus,
  RefreshCw,
  Sliders,
  Sun,
  Moon,
  Trash2,
  X,
} from 'lucide-react';
import type {
  MemoryItem,
  PersonalisationSettings,
  PreferredModelId,
  ServerModelsStatus,
  StudioProviderStatus,
} from '../types/nova';

export type WorkspaceHubTab = 'memories' | 'personalise' | 'models';

interface WorkspaceHubModalProps {
  open: boolean;
  initialTab: WorkspaceHubTab;
  memories: MemoryItem[];
  personalisation: PersonalisationSettings;
  preferredModel: PreferredModelId;
  voiceName: 'Kore' | 'Zephyr' | 'Puck';
  onClose: () => void;
  onAddMemory: (content: string, category: MemoryItem['category']) => void;
  onUpdateMemory: (id: string, next: Partial<MemoryItem>) => void;
  onDeleteMemory: (id: string) => void;
  onClearMemories: () => void;
  onUpdatePersonalisation: (next: Partial<PersonalisationSettings>) => void;
  onChangePreferredModel: (model: PreferredModelId) => void;
  onChangeVoiceName: (voice: 'Kore' | 'Zephyr' | 'Puck') => void;
}

export const WorkspaceHubModal: React.FC<WorkspaceHubModalProps> = ({
  open,
  initialTab,
  memories,
  personalisation,
  preferredModel,
  voiceName,
  onClose,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClearMemories,
  onUpdatePersonalisation,
  onChangePreferredModel,
  onChangeVoiceName,
}) => {
  const [tab, setTab] = useState<WorkspaceHubTab>(initialTab);
  const [memInput, setMemInput] = useState('');
  const [memCategory, setMemCategory] = useState<MemoryItem['category']>('preference');
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editingMemText, setEditingMemText] = useState('');

  const [modelsStatus, setModelsStatus] = useState<ServerModelsStatus | null>(null);
  const [studioStatus, setStudioStatus] = useState<StudioProviderStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerTestMsg, setProviderTestMsg] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, open]);

  const fetchModelsStatus = async () => {
    setLoadingStatus(true);
    try {
      const [mRes, sRes] = await Promise.all([
        fetch('/api/nova/models-status'),
        fetch('/api/nova/media-studio/config'),
      ]);
      if (mRes.ok) {
        const data = await mRes.json();
        setModelsStatus(data);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        setStudioStatus(sData);
      }
    } catch {
      // ignore offline
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (open && tab === 'models') {
      void fetchModelsStatus();
    }
  }, [open, tab]);

  const handleTestMediaProvider = async (provider: 'wikimedia' | 'pexels' | 'unsplash') => {
    setTestingProvider(provider);
    setProviderTestMsg(null);
    try {
      const res = await fetch('/api/nova/media-studio/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      setProviderTestMsg({
        ok: Boolean(res.ok && data.ok),
        message: data.message || data.error || 'Provider check finished.',
      });
    } catch (err) {
      setProviderTestMsg({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to reach provider check.',
      });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleTestConnection = async (modelToTest: string) => {
    setTestingModel(modelToTest);
    setTestResult(null);
    try {
      const res = await fetch('/api/nova/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToTest === 'auto' ? 'gemini-4-hydrogen' : modelToTest,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          latencyMs: data.latencyMs,
          message: data.fallbackUsed
            ? `Connected via fallback ${data.actualModel} (${data.latencyMs}ms)`
            : `Verified ${data.actualModel} in ${data.latencyMs}ms`,
        });
      } else {
        setTestResult({
          ok: false,
          latencyMs: data.latencyMs,
          message: data.error || 'Connection test failed',
        });
      }
      await fetchModelsStatus();
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setTestingModel(null);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/nova/logs', { method: 'DELETE' });
      await fetchModelsStatus();
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Nova Intelligence Workspace Settings"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-violet-400/25 bg-white dark:bg-[#110C1D] text-slate-900 dark:text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header + Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab('memories')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors ${
                tab === 'memories'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              <Brain className="h-3.5 w-3.5" />
              <span>Memories ({memories.filter((m) => m.approved && m.active).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('personalise')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors ${
                tab === 'personalise'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Personalise</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('models')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors ${
                tab === 'models'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>Models &amp; Health</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. MEMORIES TAB */}
          {tab === 'memories' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">User-Approved Long-Term Memory</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Only approved &amp; active memories are shared with Nova across sessions. Edit,
                    pause, or remove anytime.
                  </p>
                </div>
                {memories.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearMemories}
                    className="min-h-[36px] rounded-xl border border-rose-400/30 px-3 text-xs font-medium text-rose-600 dark:text-rose-300 hover:bg-rose-500/10"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!memInput.trim()) return;
                  onAddMemory(memInput.trim(), memCategory);
                  setMemInput('');
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={memInput}
                  onChange={(e) => setMemInput(e.target.value)}
                  placeholder="Add a preference or fact (e.g. 'Prefer TypeScript strict mode' or 'I study medical biology')..."
                  className="flex-1 min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
                />
                <select
                  value={memCategory}
                  onChange={(e) => setMemCategory(e.target.value as MemoryItem['category'])}
                  aria-label="Memory category"
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs focus:border-violet-400 focus:outline-none"
                >
                  <option value="preference">Preference</option>
                  <option value="fact">Fact</option>
                  <option value="workflow">Workflow</option>
                  <option value="project">Project</option>
                </select>
                <button
                  type="submit"
                  disabled={!memInput.trim()}
                  className="flex min-h-[42px] items-center justify-center gap-1 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-45 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Save Memory</span>
                </button>
              </form>

              <div className="divide-y divide-slate-200 dark:divide-white/8">
                {memories.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No saved memories yet. Add one above or tell Nova &ldquo;Remember that I prefer
                    short bullet summaries&rdquo;.
                  </p>
                ) : (
                  memories.map((m) => (
                    <div key={m.id} className="py-3 flex items-start justify-between gap-3">
                      {editingMemId === m.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (editingMemText.trim()) {
                              onUpdateMemory(m.id, { content: editingMemText.trim() });
                            }
                            setEditingMemId(null);
                          }}
                          className="flex flex-1 items-center gap-2"
                        >
                          <input
                            type="text"
                            value={editingMemText}
                            onChange={(e) => setEditingMemText(e.target.value)}
                            autoFocus
                            className="flex-1 min-h-[36px] rounded-lg border border-violet-400 bg-white dark:bg-[#181228] px-2.5 text-xs focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="min-h-[36px] rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white"
                          >
                            Save
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {m.content}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              {m.category} · {m.approved ? 'Approved' : 'Pending Approval'} ·{' '}
                              {m.active ? 'Active' : 'Paused'} · {m.createdAt}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!m.approved && (
                              <button
                                type="button"
                                onClick={() => onUpdateMemory(m.id, { approved: true, active: true })}
                                className="min-h-[32px] rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-500"
                              >
                                Approve
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onUpdateMemory(m.id, { active: !m.active })}
                              className={`min-h-[32px] rounded-lg border px-2.5 text-xs font-medium ${
                                m.active
                                  ? 'border-violet-400/35 bg-violet-600/15 text-violet-700 dark:text-violet-200'
                                  : 'border-slate-300 dark:border-white/10 text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {m.active ? 'Active' : 'Paused'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMemId(m.id);
                                setEditingMemText(m.content);
                              }}
                              aria-label="Edit memory"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteMemory(m.id)}
                              aria-label="Delete memory"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 2. PERSONALISE TAB */}
          {tab === 'personalise' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">AI Personalisation &amp; Appearance</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tailor Nova&apos;s instructions, reply style, length, language, voice speed, and
                  Light/Dark theme.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Theme Appearance
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdatePersonalisation({ theme: 'dark' })}
                      className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold ${
                        personalisation.theme === 'dark'
                          ? 'border-violet-500 bg-violet-600 text-white'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228]'
                      }`}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      <span>Obsidian Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePersonalisation({ theme: 'light' })}
                      className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold ${
                        personalisation.theme === 'light'
                          ? 'border-violet-500 bg-violet-600 text-white'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228]'
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      <span>Clean Light</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Response Style
                  </label>
                  <select
                    value={personalisation.responseStyle}
                    onChange={(e) =>
                      onUpdatePersonalisation({
                        responseStyle: e.target.value as PersonalisationSettings['responseStyle'],
                      })
                    }
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
                  >
                    <option value="balanced">Balanced &amp; Clear</option>
                    <option value="concise">Direct &amp; Concise</option>
                    <option value="detailed">Deep &amp; Thorough</option>
                    <option value="technical">Technical Engineering</option>
                    <option value="friendly">Warm Companion</option>
                    <option value="socratic">Socratic Mentor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Response Length
                  </label>
                  <select
                    value={personalisation.responseLength}
                    onChange={(e) =>
                      onUpdatePersonalisation({
                        responseLength: e.target.value as PersonalisationSettings['responseLength'],
                      })
                    }
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
                  >
                    <option value="short">Short &amp; Punchy</option>
                    <option value="medium">Standard Medium</option>
                    <option value="comprehensive">Comprehensive Detail</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Preferred Language
                  </label>
                  <select
                    value={personalisation.language}
                    onChange={(e) => onUpdatePersonalisation({ language: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
                  >
                    <option value="auto">Auto-Detect (Match User Prompt)</option>
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Japanese">Japanese</option>
                    <option value="Arabic">Arabic</option>
                    <option value="Portuguese">Portuguese</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Voice Persona
                  </label>
                  <select
                    value={voiceName}
                    onChange={(e) =>
                      onChangeVoiceName(e.target.value as 'Kore' | 'Zephyr' | 'Puck')
                    }
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
                  >
                    <option value="Kore">Kore (Warm Studio)</option>
                    <option value="Zephyr">Zephyr (Calm Crisp)</option>
                    <option value="Puck">Puck (Energetic)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    <span>Voice Playback Speed</span>
                    <span className="font-mono tabular-nums">
                      {personalisation.speechRate.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={1.3}
                    step={0.05}
                    value={personalisation.speechRate}
                    onChange={(e) =>
                      onUpdatePersonalisation({ speechRate: Number(e.target.value) })
                    }
                    className="w-full accent-violet-500 h-2 rounded-lg cursor-pointer mt-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Custom AI System Instructions
                </label>
                <textarea
                  rows={4}
                  value={personalisation.customInstructions}
                  onChange={(e) =>
                    onUpdatePersonalisation({ customInstructions: e.target.value })
                  }
                  placeholder="Tell Nova how you want it to think, format answers, or adapt to your profession/study goals..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-xs focus:border-violet-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* 3. MODELS & API HEALTH TAB */}
          {tab === 'models' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-4">
                <div>
                  <div className="text-xs font-semibold">
                    Server-Side Gemini API Security:{' '}
                    <span
                      className={
                        modelsStatus?.apiKeyConfigured
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : 'text-amber-600 dark:text-amber-300'
                      }
                    >
                      {modelsStatus
                        ? modelsStatus.apiKeyConfigured
                          ? 'Configured & Protected on Server'
                          : 'Missing GEMINI_API_KEY Environment Secret'
                        : loadingStatus
                        ? 'Checking...'
                        : 'Ready'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    API credentials stay strictly on the Express backend and are never exposed to
                    browser storage or frontend code.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleTestConnection(preferredModel)}
                  disabled={Boolean(testingModel)}
                  className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 shrink-0"
                >
                  <Activity className={`h-3.5 w-3.5 ${testingModel ? 'animate-spin' : ''}`} />
                  <span>{testingModel ? 'Testing...' : 'Test Connection'}</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                    testResult.ok
                      ? 'border-emerald-400/35 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-200'
                      : 'border-rose-400/35 bg-rose-50 dark:bg-rose-950/35 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {testResult.ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Model Selector */}
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                  Active Primary Model (with automatic fallback if unavailable)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: 'auto' as PreferredModelId,
                      label: 'Smart Auto-Router (Recommended)',
                      desc: 'Routes instant Q&A to Flash-Lite & complex reasoning to Gemini 4 Hydrogen',
                    },
                    ...(modelsStatus?.activeModels ?? [
                      {
                        id: 'gemini-4-hydrogen',
                        label: 'Gemini 4 Hydrogen',
                        role: 'Primary reasoning, tools & multimodal',
                        tier: 'standard',
                      },
                      {
                        id: 'gemini-3.1-flash-lite',
                        label: 'Gemini 3.1 Flash-Lite',
                        role: 'Fastest low-latency replies',
                        tier: 'standard',
                      },
                      {
                        id: 'gemini-4-neon',
                        label: 'Gemini 4 Neon',
                        role: 'Paid depth coding/math (auto-fallback)',
                        tier: 'paid',
                      },
                      {
                        id: 'gemini-4-carbon',
                        label: 'Gemini 4 Carbon',
                        role: 'Paid analytical/creative (auto-fallback)',
                        tier: 'paid',
                      },
                    ]).map((m) => ({
                      id: m.id as PreferredModelId,
                      label: `${m.label}${m.tier === 'paid' ? ' · Auto-Fallback' : ''}`,
                      desc: m.role,
                    })),
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangePreferredModel(opt.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        preferredModel === opt.id
                          ? 'border-violet-500 bg-violet-600/15'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] hover:border-violet-400/40'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        {opt.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Studio, Real Photo & PDF Providers */}
              {studioStatus && (
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-semibold">
                        Image Studio, Real Photo Search &amp; PDF Engine Configuration
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Managed securely via backend environment secrets (never stored in frontend)
                      </p>
                    </div>
                    <div className="text-[11px] font-medium text-violet-700 dark:text-violet-300 tabular-nums">
                      {studioStatus.usage.imagesGeneratedToday}/{studioStatus.usage.dailyImageLimit} AI imgs ·{' '}
                      {studioStatus.usage.photoSearchesToday}/{studioStatus.usage.dailyPhotoSearchLimit} searches
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-3 py-2">
                      <span>Gemini Image (GEMINI_API_KEY)</span>
                      <span
                        className={
                          studioStatus.geminiConfigured
                            ? 'text-emerald-600 dark:text-emerald-300 font-semibold'
                            : 'text-amber-600 dark:text-amber-300 font-semibold'
                        }
                      >
                        {studioStatus.geminiConfigured ? 'Configured' : 'Missing'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-3 py-2">
                      <span>PDF Engine (jsPDF + pdf-lib)</span>
                      <span className="text-emerald-600 dark:text-emerald-300 font-semibold">
                        Local Ready
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-3 py-2">
                      <span>Wikimedia Commons Photos</span>
                      <button
                        type="button"
                        disabled={testingProvider === 'wikimedia'}
                        onClick={() => void handleTestMediaProvider('wikimedia')}
                        className="text-emerald-600 dark:text-emerald-300 font-semibold hover:underline"
                      >
                        {testingProvider === 'wikimedia' ? 'Testing...' : 'Active · Test'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-3 py-2">
                      <span>Pexels / Unsplash (Env Keys)</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={testingProvider === 'pexels'}
                          onClick={() => void handleTestMediaProvider('pexels')}
                          className={`text-[11px] font-semibold hover:underline ${
                            studioStatus.pexelsConfigured
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {studioStatus.pexelsConfigured ? 'Pexels Test' : 'Pexels (Off)'}
                        </button>
                        <button
                          type="button"
                          disabled={testingProvider === 'unsplash'}
                          onClick={() => void handleTestMediaProvider('unsplash')}
                          className={`text-[11px] font-semibold hover:underline ${
                            studioStatus.unsplashConfigured
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {studioStatus.unsplashConfigured ? 'Unsplash Test' : 'Unsplash (Off)'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {providerTestMsg && (
                    <div
                      className={`rounded-xl border px-3 py-2 text-xs ${
                        providerTestMsg.ok
                          ? 'border-emerald-400/35 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-200'
                          : 'border-amber-400/35 bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-200'
                      }`}
                    >
                      {providerTestMsg.message}
                    </div>
                  )}
                </div>
              )}

              {/* Usage Metrics */}
              {modelsStatus && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3">
                    <div className="text-base font-bold tabular-nums">
                      {modelsStatus.metrics.totalRequests}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Total Requests
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3">
                    <div className="text-base font-bold text-emerald-600 dark:text-emerald-300 tabular-nums">
                      {modelsStatus.metrics.successCount}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Succeeded</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3">
                    <div className="text-base font-bold text-rose-600 dark:text-rose-300 tabular-nums">
                      {modelsStatus.metrics.errorCount}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Errors</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3">
                    <div className="text-base font-bold text-violet-600 dark:text-violet-300 tabular-nums">
                      {modelsStatus.metrics.avgLatencyMs}ms
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Avg Latency</div>
                  </div>
                </div>
              )}

              {/* Server Logs */}
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold">Recent API &amp; Error Logs</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void fetchModelsStatus()}
                      className="inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-300 hover:underline"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Refresh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleClearLogs()}
                      className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-rose-500"
                    >
                      Clear Logs
                    </button>
                  </div>
                </div>
                {!modelsStatus || modelsStatus.recentLogs.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    No API calls logged yet in this server session.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 dark:divide-white/8 text-[11px] font-mono">
                    {modelsStatus.recentLogs.map((log) => (
                      <div key={log.id} className="py-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={
                                log.ok
                                  ? 'text-emerald-600 dark:text-emerald-300 font-semibold'
                                  : 'text-rose-600 dark:text-rose-300 font-semibold'
                              }
                            >
                              {log.status}
                            </span>
                            <span className="text-slate-800 dark:text-slate-200">
                              {log.endpoint}
                            </span>
                            <span className="text-violet-600 dark:text-violet-300">{log.model}</span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 truncate mt-0.5 font-sans">
                            {log.message}
                          </div>
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                          {log.latencyMs}ms · {log.timestamp}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
