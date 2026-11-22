import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  KeyRound,
  Lock,
  RefreshCw,
  ScrollText,
  Shield,
  Sliders,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { ControlOverviewData, PermissionMode, ServerModelsStatus } from '../../types/nova';

const TOOL_LABELS: Record<string, string> = {
  'code.write': 'Code Agent Multi-File Disk Writes',
  'code.terminal': 'Code Agent Allowlisted Terminal',
  'code.github': 'GitHub REST Integration',
  'computer.fetch': 'Computer Use External Web/DOM Fetch',
  'connect.invoke': 'NOVA Connect External Tool Invocation',
  'files.export': 'File Workspace Exports',
  'scheduler.daemon': 'Background Scheduler Daemon Execution',
};

export const ControlGovernanceModule: React.FC = () => {
  const [control, setControl] = useState<ControlOverviewData | null>(null);
  const [modelsStatus, setModelsStatus] = useState<ServerModelsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [logFilter, setLogFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [ctrlRes, modRes] = await Promise.all([
        fetch('/api/nova/control/overview'),
        fetch('/api/nova/models-status'),
      ]);
      const ctrlJson = await ctrlRes.json();
      const modJson = await modRes.json();
      if (ctrlRes.ok) setControl(ctrlJson);
      if (modRes.ok) setModelsStatus(modJson);
    } catch {
      setError('Failed to fetch NOVA Control telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handlePermissionChange = async (toolKey: string, mode: PermissionMode) => {
    try {
      const resp = await fetch('/api/nova/control/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolKey, mode }),
      });
      if (!resp.ok) throw new Error('Failed to update policy');
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Policy update failed');
    }
  };

  const handleRateLimitChange = async (val: number) => {
    setSavingRate(true);
    try {
      await fetch('/api/nova/control/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateLimitMaxPerMinute: val }),
      });
      await loadOverview();
    } finally {
      setSavingRate(false);
    }
  };

  const handleApprovalDecision = async (id: string, decision: 'approve' | 'cancel') => {
    try {
      await fetch('/api/nova/control/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      await loadOverview();
    } catch {
      setError('Failed to process approval.');
    }
  };

  const handleClearApiLogs = async () => {
    await fetch('/api/nova/logs', { method: 'DELETE' });
    await loadOverview();
  };

  const filteredLogs = useMemo(() => {
    const logs = control?.auditLogs ?? [];
    if (!logFilter.trim()) return logs;
    const q = logFilter.toLowerCase();
    return logs.filter(
      (l) =>
        l.module.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.outcome.toLowerCase().includes(q)
    );
  }, [control?.auditLogs, logFilter]);

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <Shield className="h-3.5 w-3.5" />
              <span>AI Governance, Policy Matrix &amp; Telemetry</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              NOVA Control
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Enforce execution permissions across every tool, monitor sliding-window rate limits, review server API health, and inspect security audit logs.
            </p>
          </div>
          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Governance State
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <KeyRound className="h-4 w-4 text-violet-500" />
              <span>Server Gemini Key</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              {modelsStatus?.apiKeyConfigured ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Protected Server-Side</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>Env Key Missing</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Activity className="h-4 w-4 text-violet-500" />
              <span>API Requests / Avg Latency</span>
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
              {modelsStatus?.metrics.totalRequests ?? 0}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                / {modelsStatus?.metrics.avgLatencyMs ?? 0}ms
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Gauge className="h-4 w-4 text-violet-500" />
              <span>Rate Limit Window</span>
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
              {control?.rateLimitTelemetry.lastWindowRequests ?? 0} / {control?.rateLimitMaxPerMinute ?? 90}
              <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                ({control?.rateLimitTelemetry.blockedCount ?? 0} blocked)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Lock className="h-4 w-4 text-violet-500" />
              <span>Error Count</span>
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
              {modelsStatus?.metrics.errorCount ?? 0}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Sliders className="h-3.5 w-3.5 text-violet-500" />
                <span>Tool Execution Permission Matrix</span>
              </div>

              {loading && !control ? (
                <p className="mt-3 text-xs text-slate-500">Loading policies...</p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {Object.entries(control?.toolPermissions ?? {}).map(([toolKey, mode]) => (
                    <div
                      key={toolKey}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          {TOOL_LABELS[toolKey] || toolKey}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {toolKey}
                        </div>
                      </div>
                      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-white/10 dark:bg-black/40">
                        {(['auto', 'ask', 'deny'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handlePermissionChange(toolKey, opt)}
                            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase transition ${
                              mode === opt
                                ? opt === 'deny'
                                  ? 'bg-red-600 text-white'
                                  : opt === 'ask'
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-emerald-600 text-white'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
                <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>API Rate Limit Ceiling (Requests / Minute)</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {control?.rateLimitMaxPerMinute ?? 90} req/min {savingRate ? '· saving' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={300}
                  step={10}
                  value={control?.rateLimitMaxPerMinute ?? 90}
                  onChange={(e) => handleRateLimitChange(Number(e.target.value))}
                  className="mt-2 w-full accent-violet-600"
                />
              </div>
            </div>

            {control && control.pendingApprovals.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Approval Queue ({control.pendingApprovals.length})
                </div>
                <div className="mt-2.5 space-y-2">
                  {control.pendingApprovals.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-white/10 dark:bg-black/30"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{item.title}</div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {item.module} · {item.summary}
                        </div>
                      </div>
                      {item.status === 'pending' ? (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApprovalDecision(item.id, 'approve')}
                            className="rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprovalDecision(item.id, 'cancel')}
                            className="rounded bg-red-600 px-2.5 py-1 font-semibold text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="uppercase text-slate-500">{item.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-span-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <ScrollText className="h-3.5 w-3.5 text-violet-500" />
                  <span>Execution &amp; Security Audit Log ({filteredLogs.length})</span>
                </div>
                <input
                  type="text"
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  placeholder="Filter module, outcome, action..."
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </div>

              <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
                {filteredLogs.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    No matching audit records.
                  </p>
                ) : (
                  filteredLogs.slice(0, 60).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {log.outcome === 'blocked' || log.outcome === 'error' ? (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          )}
                          <span className="font-semibold uppercase text-violet-700 dark:text-violet-300">
                            {log.module}
                          </span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{log.action}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-400">
                          {log.details}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                        {log.timestamp}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {modelsStatus && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Recent API Route Telemetry ({modelsStatus.recentLogs.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleClearApiLogs}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                </div>
                <div className="mt-2.5 max-h-48 space-y-1.5 overflow-y-auto">
                  {modelsStatus.recentLogs.slice(0, 15).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] dark:bg-black/30"
                    >
                      <span className={r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {r.status}
                      </span>
                      <span className="truncate text-slate-700 dark:text-slate-300">{r.endpoint}</span>
                      <span className="shrink-0 text-slate-500">{r.model}</span>
                      <span className="shrink-0 tabular-nums text-slate-500">{r.latencyMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
