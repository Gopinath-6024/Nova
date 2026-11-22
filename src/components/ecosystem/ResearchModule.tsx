import React, { useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Search,
  Sparkles,
} from 'lucide-react';
import type { NovaProject, ResearchReport } from '../../types/nova';
import { exportResearchReport } from '../../utils/fileWorkspaceEngine';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface ResearchModuleProps {
  activeProject: NovaProject | null;
  reports: ResearchReport[];
  onSaveReport: (report: ResearchReport) => void;
}

export const ResearchModule: React.FC<ResearchModuleProps> = ({
  activeProject,
  reports,
  onSaveReport,
}) => {
  const [topic, setTopic] = useState('');
  const [urlsText, setUrlsText] = useState('');
  const [depth, setDepth] = useState<'standard' | 'deep'>('deep');
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<ResearchReport | null>(reports[0] ?? null);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || running) return;
    setRunning(true);
    setError(null);
    try {
      const urls = urlsText
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter(Boolean);

      const resp = await fetch('/api/nova/research/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), urls, depth }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Research run failed');

      const record: ResearchReport = {
        id: `res-${Date.now()}`,
        projectId: activeProject?.id,
        query: data.query || topic.trim(),
        title: data.title || topic.trim(),
        executiveSummary: data.executiveSummary || '',
        queriesInvestigated: Array.isArray(data.queriesInvestigated) ? data.queriesInvestigated : [],
        verifiedFacts: Array.isArray(data.verifiedFacts) ? data.verifiedFacts : [],
        assumptionsAndUncertainties: Array.isArray(data.assumptionsAndUncertainties)
          ? data.assumptionsAndUncertainties
          : [],
        conflictingClaims: Array.isArray(data.conflictingClaims) ? data.conflictingClaims : [],
        sections: Array.isArray(data.sections) ? data.sections : [],
        citations: Array.isArray(data.citations) ? data.citations : [],
        durationMs: Number(data.durationMs || 0),
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setActiveReport(record);
      onSaveReport(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete research.');
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!activeReport) return;
    setExporting(format);
    try {
      await exportResearchReport(activeReport, format);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Multi-Source Grounded Synthesis</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              NOVA Research
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Cross-examines Google Search angles and direct source URLs, separating verified facts from assumptions and conflicting claims.
            </p>
          </div>
          {activeReport && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                disabled={exporting !== null}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting === 'pdf' ? 'Generating PDF...' : 'Export PDF'}
              </button>
              <button
                type="button"
                onClick={() => handleExport('docx')}
                disabled={exporting !== null}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
              >
                <FileText className="h-3.5 w-3.5" />
                {exporting === 'docx' ? 'Generating DOCX...' : 'Export DOCX'}
              </button>
            </div>
          )}
        </div>

        <form
          onSubmit={handleRun}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0D0A19]"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-8">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Research Question or Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Compare WebAuthn passkeys vs hardware security keys for enterprise RBAC in 2025"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Investigation Depth
              </label>
              <div className="mt-1.5 flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-black/30">
                {(['standard', 'deep'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepth(d)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition ${
                      depth === d
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {d === 'deep' ? 'Deep Multi-Angle' : 'Standard Fast'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Optional Seed URLs to Fetch &amp; Audit Directly (comma or newline separated):
            </label>
            <textarea
              rows={2}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder="https://example.org/spec, https://..."
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
            />
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={running || !topic.trim()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {running ? 'Investigating Multiple Sources...' : 'Start Research'}
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            {activeReport ? (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#0D0A19]">
                <div className="border-b border-slate-100 pb-3 dark:border-white/10">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {activeReport.title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    <span>{activeReport.citations.length} verified sources</span>
                    <span>{(activeReport.durationMs / 1000).toFixed(1)}s runtime</span>
                    <span>{activeReport.queriesInvestigated.length} search angles</span>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                    Executive Summary
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {activeReport.executiveSummary}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Verified Facts ({activeReport.verifiedFacts.length})</span>
                    </div>
                    <ul className="mt-2 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                      {activeReport.verifiedFacts.map((f, i) => (
                        <li key={i} className="rounded bg-white/70 p-2 dark:bg-black/25">
                          <div className="font-medium">{f.claim}</div>
                          <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                            {f.sourceLabel} · {f.confidence}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                      <AlertCircle className="h-4 w-4" />
                      <span>Assumptions &amp; Uncertainties ({activeReport.assumptionsAndUncertainties.length})</span>
                    </div>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-700 dark:text-slate-200">
                      {activeReport.assumptionsAndUncertainties.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {activeReport.conflictingClaims.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-black/25">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Cross-Source Conflicts ({activeReport.conflictingClaims.length})
                    </div>
                    <div className="mt-2 space-y-2.5">
                      {activeReport.conflictingClaims.map((c, idx) => (
                        <div key={idx} className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-white p-3 text-xs md:grid-cols-2 dark:border-white/10 dark:bg-[#0B0816]">
                          <div className="md:col-span-2 font-semibold text-slate-900 dark:text-white">
                            {c.topic}
                          </div>
                          <div className="rounded bg-slate-50 p-2 text-slate-700 dark:bg-white/[0.03] dark:text-slate-300">
                            <span className="font-semibold">View A:</span> {c.perspectiveA}
                          </div>
                          <div className="rounded bg-slate-50 p-2 text-slate-700 dark:bg-white/[0.03] dark:text-slate-300">
                            <span className="font-semibold">View B:</span> {c.perspectiveB}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {activeReport.sections.map((s, idx) => (
                    <div key={idx} className="border-t border-slate-100 pt-3 dark:border-white/10">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {s.heading}
                      </h3>
                      <div className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
                        <MarkdownRenderer content={s.content} />
                      </div>
                    </div>
                  ))}
                </div>

                {activeReport.citations.length > 0 && (
                  <div className="border-t border-slate-200 pt-4 dark:border-white/10">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Source Citations ({activeReport.citations.length})
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {activeReport.citations.map((c) => (
                        <a
                          key={c.id}
                          href={c.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:border-violet-400 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-200"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{c.title}</div>
                            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {c.uri}
                            </div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/[0.02]">
                <Globe className="h-9 w-9 text-violet-500" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                  Deep Multi-Source Research Engine
                </h3>
                <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  Run a grounded query above to synthesize cited evidence, compare contradicting claims, and export briefs to PDF or DOCX.
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                <span>Saved Research Briefs ({reports.length})</span>
              </div>
              {reports.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Completed investigations are saved here for fast reference and export.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {reports.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setActiveReport(r)}
                      className={`w-full rounded-lg border p-2.5 text-left transition ${
                        activeReport?.id === r.id
                          ? 'border-violet-500 bg-violet-50 dark:border-violet-500 dark:bg-violet-500/10'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="line-clamp-2 text-xs font-semibold text-slate-900 dark:text-white">
                        {r.title}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        <span>{r.citations.length} citations</span>
                        <span>{r.createdAt}</span>
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
