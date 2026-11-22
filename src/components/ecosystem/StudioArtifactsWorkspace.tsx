import React, { useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  GitCompare,
  History,
  Send,
  Sparkles,
} from 'lucide-react';
import type { NovaProject, StudioArtifact } from '../../types/nova';
import { exportTextFile } from '../../utils/fileWorkspaceEngine';
import { NovaMiniPlanetLoader } from '../NovaCoreOrb';

interface StudioArtifactsWorkspaceProps {
  artifacts: StudioArtifact[];
  activeProject: NovaProject | null;
  isOffline: boolean;
  onSaveArtifact: (artifact: StudioArtifact) => void;
  onDeleteArtifact: (id: string) => void;
}

export const StudioArtifactsWorkspace: React.FC<StudioArtifactsWorkspaceProps> = ({
  artifacts,
  activeProject,
  isOffline,
  onSaveArtifact,
}) => {
  const [selectedId, setSelectedId] = useState<string>(artifacts[0]?.id || '');
  const [kind, setKind] = useState<StudioArtifact['kind']>('html');
  const [promptInput, setPromptInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paneMode, setPaneMode] = useState<'split' | 'code' | 'preview'>('split');
  const [showHistory, setShowHistory] = useState(false);
  const [compareVersionIdx, setCompareVersionIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const activeArtifact = useMemo(
    () => artifacts.find((a) => a.id === selectedId) ?? artifacts[0] ?? null,
    [artifacts, selectedId]
  );

  const handleGenerateOrEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || isOffline) return;
    setLoading(true);
    setError(null);
    const instruction = promptInput.trim();
    const isEditing = Boolean(activeArtifact);

    try {
      const res = await fetch('/api/nova/artifacts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: !isEditing ? instruction : undefined,
          editInstruction: isEditing ? instruction : undefined,
          currentCode: isEditing ? activeArtifact!.currentCode : undefined,
          kind: activeArtifact?.kind ?? kind,
          projectInstructions: activeProject?.instructions ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Artifact generation failed');

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (isEditing && activeArtifact) {
        const nextVerNum = activeArtifact.versions.length + 1;
        const updated: StudioArtifact = {
          ...activeArtifact,
          title: data.title || activeArtifact.title,
          summary: data.summary || activeArtifact.summary,
          currentCode: data.code,
          versions: [
            ...activeArtifact.versions,
            {
              id: `ver-${Date.now()}`,
              versionNumber: nextVerNum,
              promptOrEdit: instruction,
              summary: data.summary || 'Iterative update',
              code: data.code,
              createdAt: nowStr,
            },
          ],
          chatNotes: [
            ...activeArtifact.chatNotes,
            { role: 'user', text: instruction },
            { role: 'assistant', text: data.summary || `Updated to v${nextVerNum}` },
          ],
          updatedAt: nowStr,
          updatedAtMs: Date.now(),
        };
        onSaveArtifact(updated);
      } else {
        const newId = `art-${Date.now()}`;
        const created: StudioArtifact = {
          id: newId,
          projectId: activeProject?.id,
          title: data.title || 'Nova Interactive App',
          kind,
          summary: data.summary || 'Generated artifact',
          currentCode: data.code,
          versions: [
            {
              id: `ver-${Date.now()}`,
              versionNumber: 1,
              promptOrEdit: instruction,
              summary: data.summary || 'Initial build',
              code: data.code,
              createdAt: nowStr,
            },
          ],
          chatNotes: [
            { role: 'user', text: instruction },
            { role: 'assistant', text: data.summary || 'Created v1 artifact.' },
          ],
          updatedAt: nowStr,
          updatedAtMs: Date.now(),
        };
        onSaveArtifact(created);
        setSelectedId(newId);
      }
      setPromptInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate artifact');
    } finally {
      setLoading(false);
    }
  };

  const versionDiffLines = useMemo(() => {
    if (!activeArtifact || compareVersionIdx === null) return [];
    const targetVer = activeArtifact.versions[compareVersionIdx];
    if (!targetVer) return [];
    const oldLines = targetVer.code.split('\n');
    const newLines = activeArtifact.currentCode.split('\n');
    const maxLen = Math.min(Math.max(oldLines.length, newLines.length), 140);
    const out: Array<{ idx: number; kind: 'same' | 'changed'; prev: string; curr: string }> = [];
    for (let i = 0; i < maxLen; i++) {
      const prev = oldLines[i] ?? '';
      const curr = newLines[i] ?? '';
      out.push({ idx: i + 1, kind: prev === curr ? 'same' : 'changed', prev, curr });
    }
    return out;
  }, [activeArtifact, compareVersionIdx]);

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeArtifact?.id ?? '__new__'}
            onChange={(e) => {
              setSelectedId(e.target.value === '__new__' ? '__none__' : e.target.value);
              setCompareVersionIdx(null);
            }}
            className="min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-slate-900 dark:text-white"
          >
            <option value="__new__">+ New Artifact Workspace</option>
            {artifacts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.kind} · v{a.versions.length})
              </option>
            ))}
          </select>

          {!activeArtifact && (
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as StudioArtifact['kind'])}
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="html">HTML / CSS / JS App</option>
              <option value="react">Interactive React Component</option>
              <option value="dashboard">Analytics Dashboard</option>
              <option value="diagram">SVG Chart &amp; Diagram</option>
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-0.5">
            {(['split', 'code', 'preview'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaneMode(m)}
                className={`min-h-[32px] rounded-lg px-2.5 text-xs font-semibold capitalize ${
                  paneMode === m
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {activeArtifact && (
            <>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <History className="h-3.5 w-3.5" />
                <span>Versions ({activeArtifact.versions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(activeArtifact.currentCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 px-3 text-xs font-medium"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>Copy</span>
              </button>
              <button
                type="button"
                onClick={() => exportTextFile(activeArtifact.currentCode, activeArtifact.title, 'html')}
                className="flex min-h-[36px] items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export HTML</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Version History & Diff Drawer */}
      {showHistory && activeArtifact && (
        <div className="rounded-2xl border border-violet-400/20 bg-white dark:bg-[#120D1F] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              Version History &amp; Comparison
            </h3>
            <span className="text-[11px] text-slate-500">Compare any saved snapshot against Current</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeArtifact.versions.map((v, idx) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 py-2 text-xs"
              >
                <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">
                  v{v.versionNumber}
                </span>
                <span className="max-w-[160px] truncate text-slate-700 dark:text-slate-300">
                  {v.promptOrEdit}
                </span>
                <button
                  type="button"
                  onClick={() => setCompareVersionIdx(compareVersionIdx === idx ? null : idx)}
                  className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-300 hover:underline"
                >
                  <GitCompare className="h-3 w-3" />
                  <span>Diff</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSaveArtifact({
                      ...activeArtifact,
                      currentCode: v.code,
                      summary: `Restored v${v.versionNumber}`,
                      updatedAtMs: Date.now(),
                    })
                  }
                  className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>

          {compareVersionIdx !== null && (
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-[#0B0815] p-3 font-mono text-[11px] text-slate-200">
              {versionDiffLines.map((line) => (
                <div
                  key={line.idx}
                  className={
                    line.kind === 'changed' ? 'bg-amber-500/15 text-amber-200 px-1' : 'opacity-65 px-1'
                  }
                >
                  {line.idx}: {line.kind === 'changed' ? `- ${line.prev}  |  + ${line.curr}` : line.curr}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3-Pane Split Workspace: AI Conversation | Code Editor | Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Pane 1: AI Conversation */}
        <section className="lg:col-span-3 flex flex-col rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-4 min-h-[480px]">
          <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200 dark:border-white/10">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white">
              Artifact Designer Chat
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-2.5 max-h-[360px]">
            {!activeArtifact ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Describe any interactive dashboard, calculator, React app, chart, or responsive landing UI to build live.
              </p>
            ) : (
              activeArtifact.chatNotes.map((n, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-3 py-2 text-xs ${
                    n.role === 'user'
                      ? 'bg-violet-600 text-white ml-4'
                      : 'bg-slate-100 dark:bg-[#181228] text-slate-800 dark:text-slate-200 mr-2'
                  }`}
                >
                  {n.text}
                </div>
              ))
            )}
            {loading && <NovaMiniPlanetLoader label="Synthesizing artifact code..." />}
          </div>

          {error && (
            <div className="mb-2 rounded-xl border border-rose-400/30 bg-rose-50 dark:bg-rose-950/40 p-2 text-xs text-rose-700 dark:text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleGenerateOrEdit} className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
            <textarea
              rows={3}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={
                activeArtifact
                  ? 'Describe changes in natural language (e.g. "Add CSV export & dark chart colors")...'
                  : 'Describe the web app, dashboard, or React component...'
              }
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-2.5 text-xs text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || isOffline || !promptInput.trim()}
              className="flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-45"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{activeArtifact ? 'Apply NL Edit' : 'Generate Artifact'}</span>
            </button>
          </form>
        </section>

        {/* Pane 2: Code Editor */}
        {paneMode !== 'preview' && (
          <section
            className={`${
              paneMode === 'split' ? 'lg:col-span-4' : 'lg:col-span-9'
            } flex flex-col rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] overflow-hidden min-h-[480px]`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Code2 className="h-4 w-4 text-violet-500" />
                <span>Code Editor</span>
              </div>
              {activeArtifact && (
                <span className="text-[11px] font-mono text-slate-500">
                  {activeArtifact.currentCode.split('\n').length} lines
                </span>
              )}
            </div>
            <textarea
              value={activeArtifact?.currentCode ?? ''}
              onChange={(e) => {
                if (!activeArtifact) return;
                onSaveArtifact({
                  ...activeArtifact,
                  currentCode: e.target.value,
                  updatedAtMs: Date.now(),
                });
              }}
              placeholder="Generated HTML / React / JS code appears here and is directly editable..."
              spellCheck={false}
              className="flex-1 w-full bg-[#0B0815] text-slate-100 font-mono text-xs p-3.5 resize-none focus:outline-none leading-relaxed"
            />
          </section>
        )}

        {/* Pane 3: Sandboxed Live Preview */}
        {paneMode !== 'code' && (
          <section
            className={`${
              paneMode === 'split' ? 'lg:col-span-5' : 'lg:col-span-9'
            } flex flex-col rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] overflow-hidden min-h-[480px]`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Eye className="h-4 w-4 text-emerald-500" />
                <span>Live Sandboxed Preview</span>
              </div>
              <span className="text-[11px] text-slate-500">Isolated iframe sandbox</span>
            </div>
            {activeArtifact ? (
              <iframe
                title={activeArtifact.title}
                sandbox="allow-scripts"
                srcDoc={activeArtifact.currentCode}
                className="flex-1 w-full bg-white min-h-[440px]"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Generate an artifact on the left to inspect its live interactive preview here.
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
