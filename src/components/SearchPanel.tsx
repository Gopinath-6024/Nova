import React, { useMemo, useRef, useState } from 'react';
import {
  AppWindow,
  ExternalLink,
  FileText,
  FolderUp,
  Globe,
  Image as ImageIcon,
  Search,
  Settings,
  StickyNote,
  User,
} from 'lucide-react';
import type { GroundingSource, MobileIndexItem } from '../types/nova';
import { MarkdownRenderer } from './MarkdownRenderer';

interface SearchPanelProps {
  mobileIndex: MobileIndexItem[];
  onIndexLocalFiles: (files: FileList) => void;
  onAskNovaAboutItem: (prompt: string) => void;
}

type FilterScope = 'all' | MobileIndexItem['type'];

export const SearchPanel: React.FC<SearchPanelProps> = ({
  mobileIndex,
  onIndexLocalFiles,
  onAskNovaAboutItem,
}) => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<FilterScope>('all');
  const [webLoading, setWebLoading] = useState(false);
  const [webAnswer, setWebAnswer] = useState<string | null>(null);
  const [webSources, setWebSources] = useState<GroundingSource[]>([]);
  const [webError, setWebError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const localResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mobileIndex.filter((item) => {
      const scopeMatch = scope === 'all' || item.type === scope;
      if (!scopeMatch) return false;
      if (!q) return true;
      const haystack = `${item.title} ${item.subtitle} ${item.contentPreview ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [mobileIndex, query, scope]);

  const handleWebSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setWebLoading(true);
    setWebError(null);
    try {
      const res = await fetch('/api/nova/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Search failed');
      }
      setWebAnswer(data.answer || 'No summary returned.');
      setWebSources(Array.isArray(data.sources) ? data.sources : []);
    } catch (err) {
      setWebError(err instanceof Error ? err.message : 'Unable to reach Nova Search');
    } finally {
      setWebLoading(false);
    }
  };

  const getTypeIcon = (type: MobileIndexItem['type']) => {
    switch (type) {
      case 'app':
        return <AppWindow className="h-4 w-4 text-violet-300" />;
      case 'file':
        return <FileText className="h-4 w-4 text-indigo-300" />;
      case 'pdf':
        return <FileText className="h-4 w-4 text-violet-300" />;
      case 'image':
        return <ImageIcon className="h-4 w-4 text-fuchsia-300" />;
      case 'contact':
        return <User className="h-4 w-4 text-fuchsia-300" />;
      case 'note':
        return <StickyNote className="h-4 w-4 text-amber-300" />;
      case 'setting':
        return <Settings className="h-4 w-4 text-slate-300" />;
    }
  };

  const scopes: Array<{ id: FilterScope; label: string }> = [
    { id: 'all', label: 'Everything' },
    { id: 'pdf', label: 'PDFs' },
    { id: 'image', label: 'Pictures' },
    { id: 'file', label: 'Files' },
    { id: 'app', label: 'Apps' },
    { id: 'contact', label: 'Contacts' },
    { id: 'note', label: 'Notes' },
    { id: 'setting', label: 'Settings' },
  ];

  return (
    <div className="space-y-6">
      {/* Unified Search Bar */}
      <section className="rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Nova Universal Search Engine
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Search everything inside your mobile workspace & query the live web simultaneously
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onIndexLocalFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-violet-400/30 bg-slate-50 dark:bg-[#181228] px-3.5 py-2 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/15 transition-colors whitespace-nowrap"
            >
              <FolderUp className="h-4 w-4 text-violet-600 dark:text-violet-300" />
              <span>Index Phone Files</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleWebSearch} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files, contacts, apps, or ask the web in any language..."
              className="w-full min-h-[46px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={webLoading || !query.trim()}
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Globe className="h-4 w-4" />
            <span>{webLoading ? 'Searching Web...' : 'Search Web & Phone'}</span>
          </button>
        </form>

        {/* Interactive filter buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                scope === s.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 dark:bg-[#181228] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Local Mobile Results */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-violet-400/12 bg-white dark:bg-[#120D1F] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              On-Device Index
            </h3>
            <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              {localResults.length} items matched
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-white/8">
            {localResults.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-600 dark:text-slate-400">
                No on-device items matched &ldquo;{query}&rdquo;. Try indexing a file or running Web Search.
              </p>
            ) : (
              localResults.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-[#19122B]">
                      {getTypeIcon(item.type)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {item.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                        <span className="capitalize">{item.type}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.subtitle}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.sizeOrMeta}</span>
                      </div>
                      {item.contentPreview && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300/80 line-clamp-2">
                          {item.contentPreview}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onAskNovaAboutItem(
                        `Help me with my ${item.type} "${item.title}" (${item.subtitle}${
                          item.contentPreview ? `: ${item.contentPreview}` : ''
                        })`
                      )
                    }
                    className="min-h-[40px] shrink-0 rounded-xl border border-violet-400/30 px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/15 transition-colors whitespace-nowrap"
                  >
                    Ask Nova
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Live Grounded Web Answer */}
        <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-violet-400/12 bg-white dark:bg-[#120D1F] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Live Web Intelligence
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Google Search Grounded
            </span>
          </div>

          {webLoading ? (
            <div className="py-10 text-center text-xs text-violet-700 dark:text-violet-200">
              Scanning live web sources for &ldquo;{query}&rdquo;...
            </div>
          ) : webError ? (
            <div className="rounded-xl border border-rose-400/25 bg-rose-50 dark:bg-rose-950/30 p-3.5 text-xs text-rose-700 dark:text-rose-200">
              {webError}
            </div>
          ) : webAnswer ? (
            <div className="space-y-4">
              <div className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                <MarkdownRenderer content={webAnswer} />
              </div>
              {webSources.length > 0 && (
                <div className="border-t border-slate-200 dark:border-white/8 pt-3 space-y-2">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Verified Sources
                  </div>
                  <div className="space-y-1.5">
                    {webSources.slice(0, 5).map((src, idx) => (
                      <a
                        key={`${src.uri}-${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 rounded-xl bg-slate-100 dark:bg-[#181228] px-3 py-2 text-xs text-violet-700 dark:text-violet-200 hover:bg-violet-500/15 transition-colors"
                      >
                        <span className="truncate">{src.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="py-8 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Type any query above and tap &ldquo;Search Web &amp; Phone&rdquo; to get real-time
              answers with source links alongside your on-device results.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
