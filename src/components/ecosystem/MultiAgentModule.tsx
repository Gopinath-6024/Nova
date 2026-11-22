import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Play,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type {
  MultiAgentRunResult,
  NovaProject,
  SpecialistAgentRole,
} from '../../types/nova';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface MultiAgentModuleProps {
  activeProject: NovaProject | null;
  history: MultiAgentRunResult[];
  onSaveRun: (run: MultiAgentRunResult) => void;
}

const AGENT_OPTIONS: Array<{
  role: SpecialistAgentRole;
  label: string;
  desc: string;
}> = [
  { role: 'planning', label: 'Planning Agent', desc: 'Milestones, sequence & risk decomposition' },
  { role: 'research', label: 'Research Agent', desc: 'Google-grounded verification & fact check' },
  { role: 'coding', label: 'Coding Agent', desc: 'Production TypeScript / architecture design' },
  { role: 'testing', label: 'Testing Agent', desc: 'Edge cases, boundary checks & test plans' },
  { role: 'data_analysis', label: 'Data Analysis Agent', desc: 'Metrics, schemas & trade-off matrices' },
  { role: 'documentation', label: 'Documentation Agent', desc: 'API contracts & concise guides' },
  { role: 'qa', label: 'QA Verifier', desc: 'Conflict detection & final compliance audit' },
];

export const MultiAgentModule: React.FC<MultiAgentModuleProps> = ({
  activeProject,
  history,
  onSaveRun,
}) => {
  const [goal, setGoal] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<SpecialistAgentRole[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<MultiAgentRunResult | null>(history[0] ?? null);
  const [expandedWorkers, setExpandedWorkers] = useState<Record<string, boolean>>({});

  const toggleAgent = (role: SpecialistAgentRole) => {
    setSelectedAgents((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || running) return;
    setRunning(true);
    setError(null);
    try {
      const projectContext = activeProject
        ? `Project: ${activeProject.name}\nInstructions: ${activeProject.instructions}\nDocs: ${activeProject.documents
            .slice(0, 3)
            .map((d) => `${d.name}: ${d.excerpt}`)
            .join('\n')}`
        : '';

      const resp = await fetch('/api/nova/multi-agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          projectContext,
          selectedAgents,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `Request failed (${resp.status})`);

      const runRecord: MultiAgentRunResult = {
        id: `marun-${Date.now()}`,
        goal: goal.trim(),
        complexity: data.complexity === 'simple' ? 'simple' : 'complex',
        skippedMultiAgent: Boolean(data.skippedMultiAgent),
        coordinatorSummary: data.coordinatorSummary || '',
        agentRuns: Array.isArray(data.agentRuns) ? data.agentRuns : [],
        conflicts: Array.isArray(data.conflicts) ? data.conflicts : [],
        finalOutput: data.finalOutput || '',
        durationMs: Number(data.durationMs || 0),
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setActiveRun(runRecord);
      onSaveRun(runRecord);
      setExpandedWorkers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Multi-agent orchestration failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <Layers className="h-3.5 w-3.5" />
              <span>Multi-Agent Coordinator</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              NOVA Agents
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Parallel specialist orchestration with conflict auditing. Simple prompts take the fast path without spawning extra agents.
            </p>
          </div>
          {activeProject && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
              Scoped Project: <span className="font-semibold">{activeProject.name}</span>
            </div>
          )}
        </div>

        <form
          onSubmit={handleRun}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0D0A19]"
        >
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Mission / Complex Objective
          </label>
          <textarea
            rows={3}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g., Design a zero-downtime WebSocket notification service with TypeScript types, failure tests, and deployment runbook..."
            className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
          />

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Optional Specialist Override (leave unselected for automatic Coordinator routing):
              </span>
              {selectedAgents.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedAgents([])}
                  className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                >
                  Clear ({selectedAgents.length})
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {AGENT_OPTIONS.map((opt) => {
                const active = selectedAgents.includes(opt.role);
                return (
                  <button
                    key={opt.role}
                    type="button"
                    onClick={() => toggleAgent(opt.role)}
                    className={`min-h-[44px] rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? 'border-violet-500 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-500/15 dark:text-white'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span>{opt.label}</span>
                      {active && <CheckCircle2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Pipeline: Complexity triage -&gt; Parallel specialists -&gt; Cross-agent conflict check -&gt; Verified brief
            </span>
            <button
              type="submit"
              disabled={running || !goal.trim()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {running ? 'Running Coordinator & Agents...' : 'Execute Agents'}
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            {activeRun ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          Coordinator Evaluation
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            activeRun.skippedMultiAgent
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300'
                          }`}
                        >
                          {activeRun.skippedMultiAgent ? 'Fast-Path (Simple)' : `${activeRun.agentRuns.length} Agents Parallel`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {activeRun.coordinatorSummary}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{(activeRun.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                  </div>

                  {activeRun.conflicts.length > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Detected Cross-Agent Conflicts ({activeRun.conflicts.length})</span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {activeRun.conflicts.map((c, idx) => (
                          <div key={idx} className="rounded bg-white/80 p-2.5 text-xs dark:bg-black/30">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {c.topic} ({c.agentsInvolved.join(' vs ')})
                            </div>
                            <p className="mt-1 text-slate-600 dark:text-slate-300">{c.detail}</p>
                            <p className="mt-1 font-medium text-emerald-700 dark:text-emerald-300">
                              Resolution: {c.resolution}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeRun.agentRuns.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Specialist Worker Outputs
                      </div>
                      {activeRun.agentRuns.map((w, idx) => {
                        const key = `${activeRun.id}-${w.agent}-${idx}`;
                        const isOpen = Boolean(expandedWorkers[key]);
                        return (
                          <div
                            key={key}
                            className="rounded-lg border border-slate-200 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedWorkers((prev) => ({ ...prev, [key]: !prev[key] }))
                              }
                              className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left"
                            >
                              <div className="flex items-center gap-2.5">
                                {w.status === 'completed' ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                                )}
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-900 dark:text-white">
                                    {w.agent.replace('_', ' ')}
                                  </div>
                                  <div className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                                    {w.subtask}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                                <span>{(w.durationMs / 1000).toFixed(1)}s</span>
                                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </button>
                            {isOpen && (
                              <div className="border-t border-slate-200 px-3 py-3 text-sm dark:border-white/10">
                                <MarkdownRenderer content={w.output} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Verified Final Output</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-white/10 dark:bg-black/25">
                      <MarkdownRenderer content={activeRun.finalOutput} />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/[0.02]">
                <Bot className="h-9 w-9 text-violet-500" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                  Ready for Coordinated Execution
                </h3>
                <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  Submit a complex engineering, research, or planning goal above. Independent tasks run concurrently and pass through QA verification.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 lg:col-span-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                <span>Run History ({history.length})</span>
              </div>
              {history.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  No multi-agent runs recorded yet.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {history.slice(0, 12).map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setActiveRun(h)}
                      className={`w-full rounded-lg border p-2.5 text-left transition ${
                        activeRun?.id === h.id
                          ? 'border-violet-500 bg-violet-50 dark:border-violet-500 dark:bg-violet-500/10'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="line-clamp-2 text-xs font-medium text-slate-900 dark:text-white">
                        {h.goal}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        <span>{h.skippedMultiAgent ? 'Fast-path' : `${h.agentRuns.length} agents`}</span>
                        <span>{h.createdAt}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
