import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Code2,
  FileCode,
  FolderTree,
  GitBranch,
  History,
  Play,
  RefreshCw,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { NovaMiniPlanetLoader } from '../NovaCoreOrb';

interface WorkspaceTreeFile {
  path: string;
  size: number;
  ext: string;
  imports: string[];
}

interface ProposedEdit {
  path: string;
  reason: string;
  existed: boolean;
  previousContent: string;
  newContent: string;
  diff: {
    added: number;
    removed: number;
    hunks: Array<{ type: 'same' | 'add' | 'remove'; text: string; oldLine?: number; newLine?: number }>;
  };
}

interface SnapshotSummary {
  id: string;
  createdAt: string;
  summary: string;
  fileCount: number;
}

export const CodeAgentModule: React.FC<{ isOffline: boolean }> = ({ isOffline }) => {
  const [treeFiles, setTreeFiles] = useState<WorkspaceTreeFile[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>(['src/App.tsx']);
  const [inspectedFile, setInspectedFile] = useState<{ path: string; content: string; imports: string[] } | null>(null);
  const [subView, setSubView] = useState<'agent' | 'terminal' | 'docs' | 'github'>('agent');

  const [goal, setGoal] = useState('');
  const [operation, setOperation] = useState<'modify' | 'refactor' | 'debug' | 'explain'>('modify');
  const [planning, setPlanning] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [proposedEdits, setProposedEdits] = useState<ProposedEdit[]>([]);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);

  // Terminal & Test runner
  const [termRunning, setTermRunning] = useState<string | null>(null);
  const [termOutput, setTermOutput] = useState<{
    label: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
    failureAnalysis?: string;
  } | null>(null);

  // Docs & GitHub
  const [docsMarkdown, setDocsMarkdown] = useState('');
  const [docsLoading, setDocsLoading] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  const [githubData, setGithubData] = useState<{
    repos?: Array<{ fullName: string; defaultBranch: string; url: string }>;
    issues?: Array<{ number: number; title: string; state: string; url: string }>;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      const [treeRes, snapRes] = await Promise.all([
        fetch('/api/nova/code/tree'),
        fetch('/api/nova/code/snapshots'),
      ]);
      const treeJson = await treeRes.json();
      const snapJson = await snapRes.json();
      if (treeRes.ok && Array.isArray(treeJson.files)) {
        setTreeFiles(treeJson.files);
      }
      if (snapRes.ok && Array.isArray(snapJson.snapshots)) {
        setSnapshots(snapJson.snapshots);
      }
    } catch {
      // ignore offline
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleReadFile = async (relPath: string) => {
    try {
      const res = await fetch(`/api/nova/code/read?path=${encodeURIComponent(relPath)}`);
      const data = await res.json();
      if (res.ok) setInspectedFile(data);
    } catch {
      // ignore
    }
  };

  const togglePathContext = (p: string) => {
    setSelectedPaths((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p].slice(0, 8)
    );
  };

  const handlePlanChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || isOffline) return;
    setPlanning(true);
    setError(null);
    setApplyStatus(null);
    try {
      const res = await fetch('/api/nova/code/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          selectedPaths,
          operation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Code planning failed');
      setAnalysisText(data.analysis || '');
      setProposedEdits(Array.isArray(data.edits) ? data.edits : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to plan code edits');
    } finally {
      setPlanning(false);
    }
  };

  const handleApplyConfirmedEdits = async () => {
    if (proposedEdits.length === 0) return;
    setError(null);
    try {
      const res = await fetch('/api/nova/code/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edits: proposedEdits.map((e) => ({ path: e.path, newContent: e.newContent })),
          summary: goal.trim().slice(0, 120) || 'NOVA Code update',
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      setApplyStatus(`Applied to ${data.appliedFiles.join(', ')} (Rollback ID: ${data.snapshotId})`);
      setProposedEdits([]);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply edits');
    }
  };

  const handleRollback = async (snapshotId: string) => {
    try {
      const res = await fetch('/api/nova/code/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rollback failed');
      setApplyStatus(`Rolled back cleanly: ${data.restored.join(', ')}`);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    }
  };

  const handleRunCommand = async (commandKey: string, analyzeFailure = true) => {
    setTermRunning(commandKey);
    try {
      const res = await fetch('/api/nova/code/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandKey, analyzeFailure }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Command failed');
      setTermOutput(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute command');
    } finally {
      setTermRunning(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            NOVA Code — Repository Engineering Agent
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Inspects live project files &amp; imports, previews diffs before writing, manages rollback snapshots, and runs allowlisted build/test commands.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'agent', label: 'Code & Diffs', icon: <Code2 className="h-3.5 w-3.5" /> },
              { id: 'terminal', label: 'Tests & Terminal', icon: <Terminal className="h-3.5 w-3.5" /> },
              { id: 'docs', label: 'Generate Docs', icon: <FileCode className="h-3.5 w-3.5" /> },
              { id: 'github', label: 'GitHub REST', icon: <GitBranch className="h-3.5 w-3.5" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubView(t.id)}
              className={`flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ${
                subView === t.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 dark:bg-[#181228] text-slate-700 dark:text-slate-200'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}
      {applyStatus && (
        <div className="rounded-xl border border-emerald-400/35 bg-emerald-50 dark:bg-emerald-950/35 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-200">
          {applyStatus}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Live Project Directory Tree */}
        <section className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <FolderTree className="h-4 w-4 text-violet-500" />
              <span>Workspace Files ({treeFiles.length})</span>
            </div>
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="text-xs text-violet-600 dark:text-violet-300 hover:underline inline-flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Refresh</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Select up to 8 files to include in Code Agent inspection context ({selectedPaths.length}/8 checked).
          </p>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-white/8 text-xs">
            {treeFiles.map((f) => {
              const checked = selectedPaths.includes(f.path);
              return (
                <div key={f.path} className="py-1.5 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePathContext(f.path)}
                      className="accent-violet-600 shrink-0"
                    />
                    <span className="font-mono text-[11px] truncate text-slate-800 dark:text-slate-200">
                      {f.path}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleReadFile(f.path)}
                    className="text-[11px] text-violet-600 dark:text-violet-300 hover:underline shrink-0"
                  >
                    Inspect
                  </button>
                </div>
              );
            })}
          </div>

          {inspectedFile && (
            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="font-mono truncate">{inspectedFile.path}</span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {inspectedFile.imports.length} imports
                </span>
              </div>
              {inspectedFile.imports.length > 0 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Links: {inspectedFile.imports.slice(0, 5).join(', ')}
                </div>
              )}
              <pre className="max-h-44 overflow-auto rounded-xl bg-[#0B0815] p-2.5 text-[11px] font-mono text-slate-200">
                {inspectedFile.content.slice(0, 4000)}
              </pre>
            </div>
          )}
        </section>

        {/* Right Workspace Views */}
        <section className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-5 space-y-4">
          {subView === 'agent' && (
            <>
              <form onSubmit={handlePlanChanges} className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {(['modify', 'refactor', 'debug', 'explain'] as const).map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setOperation(op)}
                      className={`min-h-[34px] rounded-lg px-3 text-xs font-semibold capitalize ${
                        operation === op
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-100 dark:bg-[#181228] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Describe the engineering task (NOVA inspects your checked workspace files and prepares reviewable diffs before writing)..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-xs text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={planning || isOffline || !goal.trim()}
                  className="flex min-h-[42px] items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-45"
                >
                  <Code2 className="h-4 w-4" />
                  <span>{planning ? 'Inspecting Repository & Planning...' : 'Inspect & Propose Diff'}</span>
                </button>
              </form>

              {planning && <NovaMiniPlanetLoader label="Analyzing cross-file relationships..." />}

              {analysisText && (
                <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-4 text-xs">
                  <MarkdownRenderer content={analysisText} />
                </div>
              )}

              {proposedEdits.length > 0 && (
                <div className="space-y-3 border-t border-slate-200 dark:border-white/10 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Proposed File Changes ({proposedEdits.length}) — Review Before Applying
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setProposedEdits([])}
                        className="min-h-[36px] rounded-xl border border-slate-200 dark:border-white/10 px-3 text-xs"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApplyConfirmedEdits()}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Approve &amp; Apply Changes</span>
                      </button>
                    </div>
                  </div>

                  {proposedEdits.map((ed) => (
                    <div
                      key={ed.path}
                      className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden"
                    >
                      <div className="flex items-center justify-between bg-slate-100 dark:bg-[#181228] px-3 py-2 text-xs">
                        <span className="font-mono font-semibold">{ed.path}</span>
                        <span className="font-mono text-[11px] tabular-nums">
                          +{ed.diff.added} / -{ed.diff.removed}
                        </span>
                      </div>
                      <div className="px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-white/10">
                        {ed.reason}
                      </div>
                      <div className="max-h-56 overflow-auto bg-[#0B0815] p-2.5 font-mono text-[11px]">
                        {ed.diff.hunks
                          .filter((h) => h.type !== 'same')
                          .slice(0, 120)
                          .map((h, hi) => (
                            <div
                              key={hi}
                              className={
                                h.type === 'add'
                                  ? 'bg-emerald-500/15 text-emerald-300 px-1'
                                  : 'bg-rose-500/15 text-rose-300 px-1'
                              }
                            >
                              {h.type === 'add' ? '+ ' : '- '}
                              {h.text}
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Rollback Snapshots */}
              {snapshots.length > 0 && (
                <div className="border-t border-slate-200 dark:border-white/10 pt-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <History className="h-3.5 w-3.5 text-violet-500" />
                    <span>Modification Rollback Snapshots</span>
                  </div>
                  <div className="space-y-1.5">
                    {snapshots.slice(0, 5).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{s.summary}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {s.fileCount} file(s) · {s.createdAt}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRollback(s.id)}
                          className="flex min-h-[32px] items-center gap-1 rounded-lg border border-amber-400/35 px-2.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 shrink-0"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Rollback</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {subView === 'terminal' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: 'typecheck', label: 'Run TypeScript Lint' },
                  { key: 'build', label: 'Run Production Build' },
                  { key: 'rules_lint', label: 'Lint Firestore Rules' },
                  { key: 'git_status', label: 'Git Status' },
                  { key: 'git_diff', label: 'Git Diff Stat' },
                  { key: 'git_log', label: 'Git Log' },
                ].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    disabled={Boolean(termRunning)}
                    onClick={() => void handleRunCommand(c.key, true)}
                    className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-violet-400/25 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-semibold hover:bg-violet-600/15 disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5 text-violet-500" />
                    <span>{termRunning === c.key ? 'Running...' : c.label}</span>
                  </button>
                ))}
              </div>

              {termRunning && <NovaMiniPlanetLoader label="Executing allowlisted terminal command..." />}

              {termOutput && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{termOutput.label}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        termOutput.exitCode === 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      Exit {termOutput.exitCode} · {termOutput.durationMs}ms
                    </span>
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-xl bg-[#0B0815] p-3.5 font-mono text-xs text-slate-200 whitespace-pre-wrap">
                    {termOutput.stdout || termOutput.stderr || '(no output)'}
                  </pre>
                  {termOutput.failureAnalysis && (
                    <div className="rounded-xl border border-amber-400/30 bg-amber-50 dark:bg-amber-950/35 p-3 text-xs">
                      <MarkdownRenderer content={termOutput.failureAnalysis} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {subView === 'docs' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(['architecture', 'api_reference', 'onboarding_readme'] as const).map((dt) => (
                  <button
                    key={dt}
                    type="button"
                    disabled={docsLoading || isOffline}
                    onClick={async () => {
                      setDocsLoading(true);
                      try {
                        const r = await fetch('/api/nova/code/docs', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ docType: dt, selectedPaths }),
                        });
                        const d = await r.json();
                        if (r.ok) setDocsMarkdown(d.markdown || '');
                      } finally {
                        setDocsLoading(false);
                      }
                    }}
                    className="min-h-[38px] rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-45 capitalize"
                  >
                    Generate {dt.replace('_', ' ')}
                  </button>
                ))}
              </div>
              {docsLoading && <NovaMiniPlanetLoader label="Reading checked files & writing documentation..." />}
              {docsMarkdown && (
                <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-4 text-xs max-h-[420px] overflow-y-auto">
                  <MarkdownRenderer content={docsMarkdown} />
                </div>
              )}
            </div>
          )}

          {subView === 'github' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Uses the encrypted GitHub Personal Access Token configured in <strong>NOVA Connect</strong> (stored strictly server-side).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/nova/code/github', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'list_repos' }),
                    });
                    const d = await r.json();
                    setGithubData(r.ok ? { repos: d.repos } : { error: d.error });
                  }}
                  className="min-h-[38px] rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500"
                >
                  List Authorized Repositories
                </button>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  placeholder="owner/repo"
                  className="min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs"
                />
                <button
                  type="button"
                  disabled={!githubRepo.trim()}
                  onClick={async () => {
                    const r = await fetch('/api/nova/code/github', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'list_issues', repo: githubRepo.trim() }),
                    });
                    const d = await r.json();
                    setGithubData(r.ok ? { issues: d.issues } : { error: d.error });
                  }}
                  className="min-h-[38px] rounded-xl border border-violet-400/35 px-3 text-xs font-semibold"
                >
                  Load Open Issues
                </button>
              </div>
              {githubData?.error && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-50 dark:bg-amber-950/35 p-3 text-xs text-amber-800 dark:text-amber-200">
                  {githubData.error}
                </div>
              )}
              {githubData?.repos && (
                <div className="divide-y divide-slate-200 dark:divide-white/8 text-xs">
                  {githubData.repos.map((rp) => (
                    <div key={rp.fullName} className="py-2 flex items-center justify-between">
                      <span className="font-mono font-medium">{rp.fullName}</span>
                      <span className="text-slate-500">{rp.defaultBranch}</span>
                    </div>
                  ))}
                </div>
              )}
              {githubData?.issues && (
                <div className="divide-y divide-slate-200 dark:divide-white/8 text-xs">
                  {githubData.issues.map((iss) => (
                    <div key={iss.number} className="py-2">
                      #{iss.number} · {iss.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
