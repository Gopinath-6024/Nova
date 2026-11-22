import React, { useRef, useState } from 'react';
import {
  Bug,
  Check,
  Code2,
  Copy,
  FileCode2,
  FolderOpen,
  Lightbulb,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import type { PreferredModelId, ProjectSourceFile } from '../types/nova';
import { MarkdownRenderer } from './MarkdownRenderer';
import { NovaMiniPlanetLoader } from './NovaCoreOrb';

interface DeveloperStudioViewProps {
  isOffline: boolean;
  preferredModel: PreferredModelId;
}

type DevAction = 'generate' | 'debug' | 'explain' | 'optimize' | 'analyze-directory';

const LANGUAGES = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Java',
  'C++',
  'Rust',
  'Go',
  'SQL',
  'Kotlin',
  'HTML/CSS',
];

const TEXT_CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.java',
  '.cpp',
  '.c',
  '.h',
  '.rs',
  '.go',
  '.sql',
  '.kt',
  '.html',
  '.css',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.toml',
  '.sh',
]);

export const DeveloperStudioView: React.FC<DeveloperStudioViewProps> = ({
  isOffline,
  preferredModel,
}) => {
  const [action, setAction] = useState<DevAction>('generate');
  const [language, setLanguage] = useState('TypeScript');
  const [prompt, setPrompt] = useState('');
  const [code, setCode] = useState('');
  const [projectFiles, setProjectFiles] = useState<ProjectSourceFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMarkdown, setResultMarkdown] = useState('');
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filesInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const ingestFileList = async (fileList: FileList) => {
    const collected: ProjectSourceFile[] = [];
    for (let i = 0; i < fileList.length && collected.length < 24; i++) {
      const f = fileList[i];
      const relPath =
        (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      if (
        relPath.includes('node_modules/') ||
        relPath.includes('/dist/') ||
        relPath.includes('/.git/')
      ) {
        continue;
      }
      const ext = f.name.includes('.') ? `.${f.name.split('.').pop()?.toLowerCase()}` : '';
      if (!f.type.startsWith('text/') && ext && !TEXT_CODE_EXTENSIONS.has(ext)) {
        continue;
      }
      if (f.size > 180_000) continue;
      try {
        const text = await f.text();
        collected.push({
          id: `pf-${Date.now()}-${i}`,
          path: relPath,
          name: f.name,
          language: ext.replace('.', '') || 'text',
          size: f.size,
          content: text.slice(0, 8000),
        });
      } catch {
        // skip unreadable binary
      }
    }
    if (collected.length > 0) {
      setProjectFiles((prev) => [...prev, ...collected].slice(0, 24));
      if (collected.length > 1) setAction('analyze-directory');
    }
  };

  const handleRunDevAssist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline) {
      setError('Developer AI code synthesis & multi-file analysis require network access.');
      return;
    }
    if (!prompt.trim() && !code.trim() && projectFiles.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/nova/dev-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          language,
          prompt: prompt.trim(),
          code,
          projectFiles: projectFiles.map((f) => ({ path: f.path, name: f.name, content: f.content })),
          preferredModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Developer assistant failed');
      setResultMarkdown(data.resultMarkdown || '');
      setModelUsed(data.modelUsed || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run Developer AI');
    } finally {
      setLoading(false);
    }
  };

  const actions: Array<{ id: DevAction; label: string; icon: React.ReactNode }> = [
    { id: 'generate', label: 'Generate Code', icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: 'debug', label: 'Debug & Fix', icon: <Bug className="h-3.5 w-3.5" /> },
    { id: 'explain', label: 'Explain', icon: <Lightbulb className="h-3.5 w-3.5" /> },
    { id: 'optimize', label: 'Optimize', icon: <Zap className="h-3.5 w-3.5" /> },
    { id: 'analyze-directory', label: 'Analyze Project', icon: <FolderOpen className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Input Workspace */}
      <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Developer AI Assistant
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Generate, debug, explain, optimize code, or inspect multi-file project folders
            </p>
          </div>
          <Code2 className="h-5 w-5 text-violet-600 dark:text-violet-300 shrink-0" />
        </div>

        <form onSubmit={handleRunDevAssist} className="space-y-3.5">
          {/* Action Toolbar */}
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAction(a.id)}
                className={`flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors ${
                  action === a.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 dark:bg-[#181228] text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10'
                }`}
              >
                {a.icon}
                <span>{a.label}</span>
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Target Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-900 dark:text-slate-200 focus:border-violet-400 focus:outline-none"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Engineering Goal or Bug Description
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. 'Build a rate-limited Express middleware' or 'Why is my React effect looping?'"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-violet-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Code Snippet (optional)
            </label>
            <textarea
              rows={5}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste source code or stack trace to debug, explain, or optimize..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 font-mono text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-violet-400 focus:outline-none"
            />
          </div>

          {/* Multi-file & Project Directory Picker */}
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                Project Context ({projectFiles.length} file{projectFiles.length === 1 ? '' : 's'})
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  ref={filesInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void ingestFileList(e.target.files);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={dirInputRef}
                  type="file"
                  // @ts-expect-error webkitdirectory is supported in Chromium/WebKit for directory analysis
                  webkitdirectory="true"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void ingestFileList(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => filesInputRef.current?.click()}
                  className="flex min-h-[34px] items-center gap-1 rounded-lg border border-violet-400/25 px-2.5 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/15"
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  <span>Add Files</span>
                </button>
                <button
                  type="button"
                  onClick={() => dirInputRef.current?.click()}
                  className="flex min-h-[34px] items-center gap-1 rounded-lg border border-violet-400/25 px-2.5 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/15"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span>Load Folder</span>
                </button>
              </div>
            </div>

            {projectFiles.length > 0 && (
              <div className="max-h-32 overflow-y-auto divide-y divide-slate-200 dark:divide-white/8">
                {projectFiles.map((pf) => (
                  <div key={pf.id} className="flex items-center justify-between gap-2 py-1 text-[11px]">
                    <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                      {pf.path}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setProjectFiles((prev) => prev.filter((item) => item.id !== pf.id))
                      }
                      aria-label={`Remove ${pf.name}`}
                      className="text-slate-400 hover:text-rose-500 shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-400/25 bg-rose-50 dark:bg-rose-950/35 p-3 text-xs text-rose-700 dark:text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!prompt.trim() && !code.trim() && projectFiles.length === 0)}
            className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
          >
            <Code2 className="h-4 w-4" />
            <span>{loading ? 'Analyzing & Engineering...' : 'Run Developer Assistant'}</span>
          </button>
        </form>
      </section>

      {/* Right Code & Analysis Output */}
      <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Engineering Output
            </h3>
            {modelUsed && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Engine: {modelUsed}
              </div>
            )}
          </div>
          {resultMarkdown && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(resultMarkdown);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-violet-400/25 px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/15"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Output'}</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <NovaMiniPlanetLoader size="md" label="Nova Developer AI is analyzing your codebase..." />
          </div>
        ) : !resultMarkdown ? (
          <p className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
            Select an action, paste code or load a project folder on the left to inspect
            cross-file architecture, fix bugs, or generate production code.
          </p>
        ) : (
          <div className="max-h-[600px] overflow-y-auto pr-1 text-sm text-slate-900 dark:text-slate-100">
            <MarkdownRenderer content={resultMarkdown} />
          </div>
        )}
      </section>
    </div>
  );
};
