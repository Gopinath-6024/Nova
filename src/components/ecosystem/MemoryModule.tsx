import React, { useMemo, useState } from 'react';
import {
  Brain,
  Check,
  Edit3,
  FolderLock,
  Pause,
  Play,
  Plus,
  Search,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ChatSession, MemoryItem, NovaProject } from '../../types/nova';

interface MemoryModuleProps {
  memories: MemoryItem[];
  activeProject: NovaProject | null;
  activeSession: ChatSession | null;
  onAddMemory: (content: string, category: MemoryItem['category'], scope: 'general' | 'project') => void;
  onUpdateMemory: (id: string, patch: Partial<MemoryItem>) => void;
  onDeleteMemory: (id: string) => void;
  onClearScopeMemories: (scope: 'general' | 'project') => void;
  onSummarizeActiveSession?: () => Promise<void>;
}

export const MemoryModule: React.FC<MemoryModuleProps> = ({
  memories,
  activeProject,
  activeSession,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClearScopeMemories,
  onSummarizeActiveSession,
}) => {
  const [scopeTab, setScopeTab] = useState<'all' | 'general' | 'project'>(
    activeProject ? 'project' : 'general'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [relevanceProbe, setRelevanceProbe] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryItem['category']>(
    activeProject ? 'project' : 'preference'
  );
  const [newScope, setNewScope] = useState<'general' | 'project'>(
    activeProject ? 'project' : 'general'
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [summarizing, setSummarizing] = useState(false);

  const scopedMemories = useMemo(() => {
    return memories.filter((m) => {
      const mScope = m.scope || (m.projectId ? 'project' : 'general');
      if (scopeTab === 'general' && mScope !== 'general') return false;
      if (scopeTab === 'project') {
        if (!activeProject) return false;
        if (mScope !== 'project' || m.projectId !== activeProject.id) return false;
      }
      if (scopeTab === 'all') {
        // Strict isolation: NEVER leak other projects' memories even in All view
        if (mScope === 'project' && m.projectId !== activeProject?.id) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!m.content.toLowerCase().includes(q) && !m.category.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [activeProject, memories, scopeTab, searchQuery]);

  const relevantIds = useMemo(() => {
    if (!relevanceProbe.trim()) return new Set<string>();
    const words = relevanceProbe
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3);
    const matches = new Set<string>();
    for (const m of scopedMemories) {
      if (!m.approved || !m.active) continue;
      const lower = m.content.toLowerCase();
      if (words.some((w) => lower.includes(w))) matches.add(m.id);
    }
    return matches;
  }, [relevanceProbe, scopedMemories]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    const effectiveScope = newScope === 'project' && activeProject ? 'project' : 'general';
    onAddMemory(newContent.trim(), newCategory, effectiveScope);
    setNewContent('');
  };

  const handleSummarize = async () => {
    if (!onSummarizeActiveSession || summarizing) return;
    setSummarizing(true);
    try {
      await onSummarizeActiveSession();
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <Brain className="h-3.5 w-3.5" />
              <span>User-Approved Persistent Context</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              NOVA Memory
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Strict separation between General Workspace memories and Project-Scoped knowledge so project contexts never cross-contaminate.
            </p>
          </div>
          {activeSession && onSummarizeActiveSession && (
            <button
              type="button"
              onClick={handleSummarize}
              disabled={summarizing || activeSession.messages.length === 0}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {summarizing ? 'Summarizing Chat...' : 'Summarize Current Session'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-[#0D0A19]">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Visible Memories</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
              {scopedMemories.length}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-[#0D0A19]">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Active &amp; Approved</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {scopedMemories.filter((m) => m.approved && m.active).length}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-[#0D0A19]">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <FolderLock className="h-3.5 w-3.5 text-violet-500" />
              <span>Isolation Scope</span>
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {activeProject ? `Project: ${activeProject.name}` : 'General Workspace Only'}
            </div>
          </div>
        </div>

        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0D0A19]"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Save Approved Long-Term Memory
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-12">
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="e.g., Always respond with concise TypeScript diffs and Tailwind v4 utilities."
              className="sm:col-span-6 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryItem['category'])}
              className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
            >
              <option value="preference">Preference</option>
              <option value="fact">Fact</option>
              <option value="workflow">Workflow</option>
              <option value="project">Project</option>
            </select>
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as 'general' | 'project')}
              className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
            >
              <option value="general">General</option>
              <option value="project" disabled={!activeProject}>
                {activeProject ? `Project (${activeProject.name.slice(0, 12)})` : 'No Active Project'}
              </option>
            </select>
            <button
              type="submit"
              disabled={!newContent.trim()}
              className="sm:col-span-2 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
            <div className="flex items-center gap-1.5">
              {(['general', 'project', 'all'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  disabled={tab === 'project' && !activeProject}
                  onClick={() => setScopeTab(tab)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition disabled:opacity-40 ${
                    scopeTab === tab
                      ? 'bg-violet-600 text-white'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
                  }`}
                >
                  {tab === 'project' && activeProject ? `Project: ${activeProject.name}` : tab}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter memories..."
                  className="rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  onClearScopeMemories(scopeTab === 'project' && activeProject ? 'project' : 'general')
                }
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <Shield className="h-3.5 w-3.5" />
                Privacy Clear Scope
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Test Context Retrieval:
            </span>
            <input
              type="text"
              value={relevanceProbe}
              onChange={(e) => setRelevanceProbe(e.target.value)}
              placeholder="Enter sample prompt to highlight which memories NOVA retrieves..."
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
            />
          </div>

          <div className="mt-4 space-y-2.5">
            {scopedMemories.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No memories stored in this isolated scope yet.
              </p>
            ) : (
              scopedMemories.map((m) => {
                const matched = relevantIds.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3 transition ${
                      matched
                        ? 'border-violet-500 bg-violet-50/70 dark:border-violet-500 dark:bg-violet-500/10'
                        : 'border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02]'
                    }`}
                  >
                    {editingId === m.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-black/40 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateMemory(m.id, { content: editText.trim() });
                            setEditingId(null);
                          }}
                          className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded border border-slate-300 px-3 py-1.5 text-xs dark:border-white/15"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700 dark:bg-white/10 dark:text-slate-300">
                              {m.category}
                            </span>
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800 dark:bg-violet-500/20 dark:text-violet-300">
                              {m.scope === 'project' ? 'Project-Isolated' : 'General'}
                            </span>
                            {!m.approved && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                                Pending Approval
                              </span>
                            )}
                            {matched && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                                Retrieved Match
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm text-slate-800 dark:text-slate-100">{m.content}</p>
                        </div>

                        <div className="flex items-center gap-1">
                          {!m.approved && (
                            <button
                              type="button"
                              onClick={() => onUpdateMemory(m.id, { approved: true, active: true })}
                              className="inline-flex min-h-[32px] items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Approve
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onUpdateMemory(m.id, { active: !m.active })}
                            title={m.active ? 'Pause memory' : 'Resume memory'}
                            className="inline-flex min-h-[32px] items-center justify-center rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300"
                          >
                            {m.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditText(m.content);
                            }}
                            aria-label="Edit memory"
                            className="inline-flex min-h-[32px] items-center justify-center rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMemory(m.id)}
                            aria-label="Delete memory"
                            className="inline-flex min-h-[32px] items-center justify-center rounded border border-slate-200 px-2 py-1 text-red-600 hover:bg-red-50 dark:border-white/15 dark:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
