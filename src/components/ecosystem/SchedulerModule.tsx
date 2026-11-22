import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CalendarClock,
  CheckCheck,
  Clock,
  Edit3,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from 'lucide-react';
import type { SchedulerJobItem, SchedulerNotifItem } from '../../types/nova';

interface SchedulerModuleProps {
  onNotificationsChange?: (notifs: SchedulerNotifItem[]) => void;
}

export const SchedulerModule: React.FC<SchedulerModuleProps> = ({ onNotificationsChange }) => {
  const [jobs, setJobs] = useState<SchedulerJobItem[]>([]);
  const [notifications, setNotifications] = useState<SchedulerNotifItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<SchedulerJobItem['kind']>('daily_summary');
  const [cadence, setCadence] = useState<SchedulerJobItem['cadence']>('daily');
  const [cronExpr, setCronExpr] = useState('*/15 * * * *');
  const [delayMinutes, setDelayMinutes] = useState(5);
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, notifsRes] = await Promise.all([
        fetch('/api/nova/scheduler/jobs'),
        fetch('/api/nova/scheduler/notifications'),
      ]);
      const jobsJson = await jobsRes.json();
      const notifsJson = await notifsRes.json();
      if (jobsRes.ok && Array.isArray(jobsJson.jobs)) setJobs(jobsJson.jobs);
      if (notifsRes.ok && Array.isArray(notifsJson.notifications)) {
        setNotifications(notifsJson.notifications);
        onNotificationsChange?.(notifsJson.notifications);
      }
    } catch {
      setError('Unable to reach backend scheduler daemon.');
    } finally {
      setLoading(false);
    }
  }, [onNotificationsChange]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch('/api/nova/scheduler/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          kind,
          cadence,
          cronExpr: cadence === 'cron' ? cronExpr.trim() : undefined,
          delayMinutes: cadence === 'once' ? delayMinutes : undefined,
          prompt: prompt.trim() || title.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to schedule job');
      setTitle('');
      setPrompt('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create scheduled job');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async (job: SchedulerJobItem) => {
    try {
      await fetch(`/api/nova/scheduler/jobs/${encodeURIComponent(job.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      await loadAll();
    } catch {
      setError('Failed to toggle job.');
    }
  };

  const handleSaveEdit = async (jobId: string) => {
    try {
      await fetch(`/api/nova/scheduler/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), prompt: editPrompt.trim() }),
      });
      setEditingJobId(null);
      await loadAll();
    } catch {
      setError('Failed to update job.');
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      await fetch(`/api/nova/scheduler/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      await loadAll();
    } catch {
      setError('Failed to delete job.');
    }
  };

  const handleRunNow = async (jobId: string) => {
    setRunningId(jobId);
    setError(null);
    try {
      const resp = await fetch(`/api/nova/scheduler/jobs/${encodeURIComponent(jobId)}/run-now`, {
        method: 'POST',
      });
      if (!resp.ok) throw new Error('Manual trigger failed');
      await loadAll();
      setExpandedJobId(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunningId(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const resp = await fetch('/api/nova/scheduler/notifications/read-all', { method: 'POST' });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
        onNotificationsChange?.(data.notifications);
      }
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Persistent Node Background Daemon</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              NOVA Scheduler
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Executes recurring AI summaries, research briefs, and reminders on the server independently of open browser tabs.
            </p>
          </div>
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Daemon State
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <form
              onSubmit={handleCreate}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0D0A19]"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Plus className="h-3.5 w-3.5 text-violet-500" />
                <span>Create Scheduled Workflow</span>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Job Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Morning AI Engineering Digest"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Workflow Type
                  </label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as SchedulerJobItem['kind'])}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    <option value="daily_summary">Daily Summary</option>
                    <option value="weekly_report">Weekly Report</option>
                    <option value="scheduled_research">Scheduled Research</option>
                    <option value="task_reminder">Task Reminder</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Cadence
                  </label>
                  <select
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value as SchedulerJobItem['cadence'])}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    <option value="once">One-Time Delay</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="cron">Cron Expression</option>
                  </select>
                </div>
              </div>

              {cadence === 'once' && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Delay Minutes
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={delayMinutes}
                    onChange={(e) => setDelayMinutes(Number(e.target.value) || 5)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </div>
              )}

              {cadence === 'cron' && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Cron Expression (minute hour dom month dow)
                  </label>
                  <input
                    type="text"
                    value={cronExpr}
                    onChange={(e) => setCronExpr(e.target.value)}
                    placeholder="*/15 * * * *"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Execution Prompt / Instructions
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="What should NOVA execute, research, or remind you about when triggered?"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                <CalendarClock className="h-4 w-4" />
                {saving ? 'Scheduling on Server...' : 'Schedule Background Job'}
              </button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Bell className="h-3.5 w-3.5 text-violet-500" />
                  <span>Scheduler Notification Inbox ({unreadCount} unread)</span>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark All Read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  No scheduled execution notifications yet.
                </p>
              ) : (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {notifications.slice(0, 20).map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-lg border p-2.5 text-xs ${
                        n.read
                          ? 'border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02]'
                          : 'border-violet-400 bg-violet-50/70 dark:border-violet-500/50 dark:bg-violet-500/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-slate-900 dark:text-white">
                        <span>{n.title}</span>
                        <span className="text-[11px] font-normal text-slate-500 tabular-nums dark:text-slate-400">
                          {n.createdAt}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Active &amp; Paused Server Jobs ({jobs.length})
                </span>
              </div>

              {loading ? (
                <p className="mt-4 text-xs text-slate-500">Loading scheduled jobs...</p>
              ) : jobs.length === 0 ? (
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                  No jobs scheduled. Create one on the left and click Run Now or wait for its cadence tick.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      {editingJobId === job.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-white/15 dark:bg-black/40 dark:text-white"
                          />
                          <textarea
                            rows={2}
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-black/40 dark:text-white"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(job.id)}
                              className="rounded bg-violet-600 px-3 py-1 text-xs font-semibold text-white"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingJobId(null)}
                              className="rounded border border-slate-300 px-3 py-1 text-xs dark:border-white/15"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {job.title}
                                </span>
                                <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700 dark:bg-white/10 dark:text-slate-300">
                                  {job.cadence}
                                  {job.cronExpr ? ` (${job.cronExpr})` : ''}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                    job.enabled
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                                      : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400'
                                  }`}
                                >
                                  {job.enabled ? 'Active' : 'Paused'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{job.prompt}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Next: {new Date(job.nextRunAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span>Runs: {job.runCount}</span>
                                {job.lastRunAt && <span>Last ran: {job.lastRunAt}</span>}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRunNow(job.id)}
                                disabled={runningId === job.id}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                              >
                                <Zap className="h-3.5 w-3.5" />
                                {runningId === job.id ? 'Running...' : 'Run Now'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTogglePause(job)}
                                title={job.enabled ? 'Pause job' : 'Resume job'}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
                              >
                                {job.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                {job.enabled ? 'Pause' : 'Resume'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingJobId(job.id);
                                  setEditTitle(job.title);
                                  setEditPrompt(job.prompt);
                                }}
                                aria-label="Edit job"
                                className="inline-flex min-h-[34px] items-center justify-center rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(job.id)}
                                aria-label="Delete job"
                                className="inline-flex min-h-[34px] items-center justify-center rounded-md border border-slate-200 px-2 py-1 text-red-600 hover:bg-red-50 dark:border-white/15 dark:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {job.lastResult && (
                            <div className="mt-2.5 rounded border border-slate-200 bg-white p-2.5 text-xs text-slate-700 dark:border-white/10 dark:bg-black/30 dark:text-slate-300">
                              <div className="font-semibold text-violet-700 dark:text-violet-300">
                                Latest Output
                              </div>
                              <p className="mt-1 whitespace-pre-wrap">{job.lastResult}</p>
                            </div>
                          )}

                          {job.history.length > 0 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedJobId(expandedJobId === job.id ? null : job.id)
                                }
                                className="text-[11px] font-medium text-violet-600 hover:underline dark:text-violet-400"
                              >
                                {expandedJobId === job.id ? 'Hide' : 'Show'} Execution History ({job.history.length})
                              </button>
                              {expandedJobId === job.id && (
                                <div className="mt-1.5 space-y-1">
                                  {job.history.map((h) => (
                                    <div
                                      key={h.id}
                                      className="flex items-start justify-between gap-2 rounded bg-white/80 px-2.5 py-1.5 text-[11px] dark:bg-black/30"
                                    >
                                      <span className="text-slate-700 dark:text-slate-300">{h.outputSummary}</span>
                                      <span className="shrink-0 tabular-nums text-slate-500">{h.ranAt}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
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
