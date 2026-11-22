import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Play,
  RefreshCw,
  ShieldAlert,
  SkipForward,
  Square,
  XCircle,
} from 'lucide-react';
import type { AgentRunPlan, AgentStep } from '../types/nova';
import { MarkdownRenderer } from './MarkdownRenderer';
import { NovaMiniPlanetLoader } from './NovaCoreOrb';

interface AgentRunnerPanelProps {
  plan: AgentRunPlan | null;
  isOffline: boolean;
  onStartObjective: (objective: string) => void;
  onApproveStep: (stepId: string) => void;
  onSkipStep: (stepId: string) => void;
  onRetryStep: (stepId: string) => void;
  onCancelPlan: () => void;
}

export const AgentRunnerPanel: React.FC<AgentRunnerPanelProps> = ({
  plan,
  isOffline,
  onStartObjective,
  onApproveStep,
  onSkipStep,
  onRetryStep,
  onCancelPlan,
}) => {
  const [objective, setObjective] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!objective.trim()) return;
    onStartObjective(objective.trim());
    setObjective('');
  };

  const renderStatusIcon = (status: AgentStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-300 shrink-0" />;
      case 'running':
        return <RefreshCw className="h-4 w-4 text-violet-500 dark:text-violet-300 animate-spin shrink-0" />;
      case 'awaiting_confirmation':
        return <ShieldAlert className="h-4 w-4 text-amber-500 dark:text-amber-300 shrink-0" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-rose-500 dark:text-rose-300 shrink-0" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-slate-400 shrink-0" />;
      default:
        return <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 ml-0.5" />;
    }
  };

  const sampleGoals = [
    'Research top offline note-taking habits, add a study task, and build a PDF action guide',
    'Audit my device security status and summarize risks with a preventive checklist',
    'Set a 07:30 morning alarm, turn on Do Not Disturb, and generate cosmic purple wallpaper',
  ];

  const completedCount = plan
    ? plan.steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600/15 text-violet-600 dark:text-violet-300">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Autonomous Multi-Step Agent
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Breaks goals into verifiable steps, runs tools automatically, pauses for confirmation
              before consequential actions, and verifies completion.
            </p>
          </div>
        </div>
        {plan && plan.status !== 'idle' && (
          <button
            type="button"
            onClick={onCancelPlan}
            className="flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-200 dark:border-white/15 px-2.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 shrink-0"
          >
            <Square className="h-3 w-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {isOffline && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-50 dark:bg-amber-950/35 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Autonomous cloud planning requires network access. Reconnect to launch the agent.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          disabled={isOffline || plan?.status === 'planning' || plan?.status === 'running'}
          placeholder="Give Nova Agent a multi-step objective..."
          className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#171127] px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={
            isOffline ||
            !objective.trim() ||
            plan?.status === 'planning' ||
            plan?.status === 'running'
          }
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-45 shrink-0"
        >
          <Play className="h-3.5 w-3.5" />
          <span>Run Agent</span>
        </button>
      </form>

      {!plan && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Sample Multi-Step Goals:
          </div>
          <div className="flex flex-wrap gap-2">
            {sampleGoals.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setObjective(g)}
                className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:border-violet-400 transition-colors"
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-violet-400/20 bg-slate-50/70 dark:bg-[#140F22] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                Goal: {plan.objective}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                {plan.status === 'planning'
                  ? 'Building step execution plan...'
                  : `${completedCount}/${plan.steps.length} steps resolved · Status: ${plan.status.replace(
                      '_',
                      ' '
                    )}`}
              </div>
            </div>
          </div>

          {plan.status === 'planning' && (
            <div className="py-2">
              <NovaMiniPlanetLoader label="Nova Agent is decomposing steps..." />
            </div>
          )}

          <div className="space-y-2.5">
            {plan.steps.map((step, idx) => (
              <div
                key={step.id}
                className={`rounded-xl border p-3 text-xs transition-colors ${
                  step.status === 'awaiting_confirmation'
                    ? 'border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/25'
                    : step.status === 'failed'
                    ? 'border-rose-400/40 bg-rose-50/70 dark:bg-rose-950/25'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A132B]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5">{renderStatusIcon(step.status)}</div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {idx + 1}. {step.title}{' '}
                        <span className="font-mono text-[11px] font-normal text-violet-600 dark:text-violet-300">
                          [{step.tool}]
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-600 dark:text-slate-300">{step.description}</p>
                      {step.result && (
                        <div className="mt-2 rounded-lg bg-slate-100 dark:bg-black/25 p-2.5 text-slate-800 dark:text-slate-200">
                          <MarkdownRenderer content={step.result} />
                        </div>
                      )}
                      {step.error && (
                        <p className="mt-1.5 text-rose-600 dark:text-rose-300">{step.error}</p>
                      )}
                    </div>
                  </div>
                </div>

                {step.status === 'awaiting_confirmation' && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-amber-300/40 dark:border-amber-400/20 pt-2.5">
                    <div className="text-[11px] text-amber-800 dark:text-amber-200">
                      Confirmation required for tool parameters:{' '}
                      <code className="font-mono">{JSON.stringify(step.args)}</code>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSkipStep(step.id)}
                        className="min-h-[34px] rounded-lg border border-slate-300 dark:border-white/15 px-3 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10"
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => onApproveStep(step.id)}
                        className="min-h-[34px] rounded-lg bg-violet-600 px-3 font-semibold text-white hover:bg-violet-500"
                      >
                        Approve &amp; Run
                      </button>
                    </div>
                  </div>
                )}

                {step.status === 'failed' && (
                  <div className="mt-2.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onRetryStep(step.id)}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Recover &amp; Retry</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {plan.finalReport && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-50/70 dark:bg-emerald-950/20 p-3.5 text-xs text-slate-900 dark:text-slate-100">
              <div className="mb-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                Verified Completion Report
              </div>
              <MarkdownRenderer content={plan.finalReport} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
