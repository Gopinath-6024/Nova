import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  MessageSquarePlus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { ChatSession } from '../types/nova';

interface ConversationSidebarProps {
  open: boolean;
  sessions: ChatSession[];
  activeSessionId: string;
  summarizingId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
  onSummarizeSession: (id: string) => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  open,
  sessions,
  activeSessionId,
  summarizingId,
  onClose,
  onNewChat,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onSummarizeSession,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...sessions].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    if (!q) return sorted;
    return sorted.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.summary ?? '').toLowerCase().includes(q) ||
        s.messages.some((m) => m.text.toLowerCase().includes(q))
    );
  }, [searchQuery, sessions]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Conversations History"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-sm flex-col border-r border-violet-500/20 bg-white dark:bg-[#0D0917] text-slate-900 dark:text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-4 py-3.5">
          <div>
            <h2 className="text-sm font-bold">Conversations</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {sessions.length} saved thread{sessions.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onNewChat();
                onClose();
              }}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close conversations"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-slate-200 dark:border-white/10">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search titles or messages..."
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161026] pl-9 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/8 px-3">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No conversations matched &ldquo;{searchQuery}&rdquo;.
            </p>
          ) : (
            filtered.map((session) => {
              const active = session.id === activeSessionId;
              const isEditing = editingId === session.id;
              return (
                <div
                  key={session.id}
                  className={`py-3 transition-colors ${
                    active ? 'bg-violet-50/80 dark:bg-violet-600/12 -mx-3 px-3 rounded-xl' : ''
                  }`}
                >
                  {isEditing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (draftTitle.trim()) {
                          onRenameSession(session.id, draftTitle.trim());
                        }
                        setEditingId(null);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        autoFocus
                        className="flex-1 min-h-[34px] rounded-lg border border-violet-400 bg-white dark:bg-[#181228] px-2.5 text-xs focus:outline-none"
                      />
                      <button
                        type="submit"
                        aria-label="Save title"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSession(session.id);
                          onClose();
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-xs font-semibold truncate text-slate-900 dark:text-white">
                          {session.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {session.messages.length} msgs · {session.mode} · {session.updatedAt}
                        </div>
                        {session.summary && (
                          <p className="mt-1 text-[11px] text-violet-700 dark:text-violet-300/85 line-clamp-2">
                            {session.summary}
                          </p>
                        )}
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSummarizeSession(session.id)}
                          disabled={summarizingId === session.id}
                          title="Smart Summarize & Auto-Title"
                          aria-label={`Summarize ${session.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-violet-600 dark:text-violet-300 hover:bg-violet-500/15 disabled:opacity-45"
                        >
                          <Sparkles
                            className={`h-3.5 w-3.5 ${
                              summarizingId === session.id ? 'animate-spin' : ''
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(session.id);
                            setDraftTitle(session.title);
                          }}
                          aria-label={`Rename ${session.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        {sessions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onDeleteSession(session.id)}
                            aria-label={`Delete ${session.title}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
