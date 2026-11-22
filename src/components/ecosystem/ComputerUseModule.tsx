import React, { useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Eye,
  FileCode2,
  Globe,
  Monitor,
  Play,
  ShieldAlert,
  Table as TableIcon,
  XCircle,
} from 'lucide-react';
import type { ComputerStep } from '../../types/nova';
import { MarkdownRenderer } from '../MarkdownRenderer';

export const ComputerUseModule: React.FC = () => {
  const [task, setTask] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [environmentNote, setEnvironmentNote] = useState(
    'Executes inside NOVA sandboxed HTTP/DOM & workspace session (cannot control external desktop OS GUI apps outside the container).'
  );
  const [planSummary, setPlanSummary] = useState('');
  const [steps, setSteps] = useState<ComputerStep[]>([]);
  const [planning, setPlanning] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [screenQuery, setScreenQuery] = useState('Identify all interactive UI controls, forms, errors, and recommended actions.');
  const [screenPreviewUrl, setScreenPreviewUrl] = useState<string | null>(null);
  const [screenResult, setScreenResult] = useState<string>('');
  const [analyzingScreen, setAnalyzingScreen] = useState(false);
  const screenInputRef = useRef<HTMLInputElement>(null);

  const activeStep = steps.find((s) => s.id === selectedStepId) ?? steps.find((s) => s.result) ?? steps[0] ?? null;

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim() || planning) return;
    setPlanning(true);
    setError(null);
    try {
      const resp = await fetch('/api/nova/computer/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.trim(), targetUrl: targetUrl.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to plan steps');
      if (data.environmentNote) setEnvironmentNote(data.environmentNote);
      setPlanSummary(data.summary || '');
      const planned: ComputerStep[] = Array.isArray(data.steps) ? data.steps : [];
      setSteps(planned);
      setSelectedStepId(planned[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to plan automation.');
    } finally {
      setPlanning(false);
    }
  };

  const handleExecuteStep = async (step: ComputerStep) => {
    setExecutingId(step.id);
    setError(null);
    try {
      const resp = await fetch('/api/nova/computer/execute-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: step.kind,
          target: step.target,
          selectorOrQuery: step.selectorOrQuery || '',
          confirmed: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Step execution failed');

      setSteps((prev) =>
        prev.map((s) =>
          s.id === step.id
            ? {
                ...s,
                status: 'executed',
                result: {
                  finalUrl: data.page?.finalUrl,
                  status: data.page?.status,
                  title: data.page?.title,
                  headings: data.page?.headings,
                  links: data.page?.links,
                  forms: data.page?.forms,
                  tables: data.page?.tables,
                  textExtract: data.page?.textExtract ?? data.textExtract,
                  sanitizedHtml: data.page?.sanitizedHtml,
                  extractedMatches: data.extractedMatches,
                  analysisText: data.analysisText,
                  filePath: data.filePath,
                },
              }
            : s
        )
      );
      setSelectedStepId(step.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution error';
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: 'error', error: msg } : s)));
      setError(msg);
    } finally {
      setExecutingId(null);
    }
  };

  const handleCancelStep = (stepId: string) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, status: 'cancelled' } : s)));
  };

  const handleUploadScreen = async (file: File) => {
    setAnalyzingScreen(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });
      setScreenPreviewUrl(dataUrl);
      const resp = await fetch('/api/nova/computer/execute-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'analyze_screen',
          target: file.name,
          selectorOrQuery: screenQuery,
          confirmed: true,
          screenshotBase64: dataUrl,
          screenshotMimeType: file.type || 'image/png',
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Screen analysis failed');
      setScreenResult(data.analysisText || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screen inspection error');
    } finally {
      setAnalyzingScreen(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <Monitor className="h-3.5 w-3.5" />
              <span>Permissioned Web &amp; File Automation</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              NOVA Computer
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{environmentNote}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <form
              onSubmit={handlePlan}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0D0A19]"
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                1. Plan Auditable Steps
              </div>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="Target public https:// URL (optional for workspace checks)"
                className="mt-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
              <textarea
                rows={3}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="e.g., Open docs page, extract all API endpoint tables and headings, or inspect package.json"
                className="mt-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
              <button
                type="submit"
                disabled={planning || !task.trim()}
                className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                <Globe className="h-4 w-4" />
                {planning ? 'Planning Safe Steps...' : 'Generate Step Preview'}
              </button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Screen Vision Inspector
                </span>
                <input
                  ref={screenInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadScreen(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => screenInputRef.current?.click()}
                  disabled={analyzingScreen}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {analyzingScreen ? 'Analyzing...' : 'Upload Screenshot'}
                </button>
              </div>
              <input
                type="text"
                value={screenQuery}
                onChange={(e) => setScreenQuery(e.target.value)}
                placeholder="What should NOVA locate on the screenshot?"
                className="mt-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
              {screenPreviewUrl && (
                <img
                  src={screenPreviewUrl}
                  alt="Uploaded screen capture"
                  className="mt-2.5 max-h-40 w-full rounded-lg border border-slate-200 object-contain dark:border-white/10"
                />
              )}
              {screenResult && (
                <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-white/10 dark:bg-black/30">
                  <MarkdownRenderer content={screenResult} />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  2. Action Queue &amp; Approval
                </span>
                {planSummary && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{steps.length} step(s)</span>
                )}
              </div>
              {planSummary && (
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{planSummary}</p>
              )}

              {error && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}

              {steps.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  No steps planned yet. Submit a URL or task above to preview each action before approving.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {steps.map((step, idx) => (
                    <div
                      key={step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={`cursor-pointer rounded-lg border p-3 transition ${
                        activeStep?.id === step.id
                          ? 'border-violet-500 bg-violet-50/70 dark:border-violet-500 dark:bg-violet-500/10'
                          : 'border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                            <span className="tabular-nums text-violet-600 dark:text-violet-400">#{idx + 1}</span>
                            <span>{step.label}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {step.kind} -&gt; {step.target || 'workspace'}
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{step.preview}</p>
                        </div>
                        {step.status === 'executed' && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        )}
                        {step.status === 'cancelled' && (
                          <XCircle className="h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        {step.status === 'error' && (
                          <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
                        )}
                      </div>

                      {step.status === 'pending' && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExecuteStep(step);
                            }}
                            disabled={executingId === step.id}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <Play className="h-3.5 w-3.5" />
                            {executingId === step.id ? 'Executing...' : 'Approve & Run'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelStep(step.id);
                            }}
                            className="min-h-[36px] rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {step.error && (
                        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{step.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Eye className="h-4 w-4 text-violet-500" />
                  <span>Live DOM, Forms, Tables &amp; Sandboxed Page Inspector</span>
                </div>
                {activeStep?.result?.status && (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 tabular-nums dark:bg-emerald-500/15 dark:text-emerald-300">
                    HTTP {activeStep.result.status}
                  </span>
                )}
              </div>

              {activeStep?.result ? (
                <div className="mt-4 space-y-4">
                  {activeStep.result.title && (
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {activeStep.result.title}
                      </div>
                      {activeStep.result.finalUrl && (
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {activeStep.result.finalUrl}
                        </div>
                      )}
                    </div>
                  )}

                  {activeStep.result.extractedMatches && activeStep.result.extractedMatches.length > 0 && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/10">
                      <div className="text-xs font-semibold text-violet-900 dark:text-violet-200">
                        CSS Selector Matches ({activeStep.result.extractedMatches.length})
                      </div>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-200">
                        {activeStep.result.extractedMatches.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeStep.result.headings && activeStep.result.headings.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Headings ({activeStep.result.headings.length})
                      </div>
                      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {activeStep.result.headings.slice(0, 10).map((h, i) => (
                          <div
                            key={i}
                            className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-white/10 dark:bg-black/25 dark:text-slate-300"
                          >
                            {h}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeStep.result.forms && activeStep.result.forms.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Detected Forms ({activeStep.result.forms.length})
                      </div>
                      <div className="mt-1.5 space-y-1.5">
                        {activeStep.result.forms.map((f, i) => (
                          <div
                            key={i}
                            className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-white/10 dark:bg-black/25"
                          >
                            <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {f.method} {f.action}
                            </div>
                            <div className="mt-1 text-slate-500 dark:text-slate-400">
                              Fields: {f.fields.join(', ') || 'none'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeStep.result.tables && activeStep.result.tables.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <TableIcon className="h-3.5 w-3.5" />
                        <span>Extracted Tables ({activeStep.result.tables.length})</span>
                      </div>
                      <div className="mt-2 space-y-3 overflow-x-auto">
                        {activeStep.result.tables.map((t, ti) => (
                          <table key={ti} className="w-full border-collapse text-left text-xs">
                            {t.headers.length > 0 && (
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                                  {t.headers.map((h, hi) => (
                                    <th key={hi} className="px-2.5 py-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                            )}
                            <tbody>
                              {t.rows.map((r, ri) => (
                                <tr key={ri} className="border-b border-slate-100 dark:border-white/5">
                                  {r.map((cell, ci) => (
                                    <td key={ci} className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeStep.result.textExtract && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <FileCode2 className="h-3.5 w-3.5" />
                        <span>
                          {activeStep.result.filePath
                            ? `Workspace File: ${activeStep.result.filePath}`
                            : 'Extracted Text'}
                        </span>
                      </div>
                      <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs whitespace-pre-wrap text-slate-800 dark:border-white/10 dark:bg-black/40 dark:text-slate-200">
                        {activeStep.result.textExtract}
                      </pre>
                    </div>
                  )}

                  {activeStep.result.sanitizedHtml && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Sandboxed HTML Render (Scripts Stripped)
                      </div>
                      <iframe
                        title="NOVA Sandboxed DOM View"
                        sandbox=""
                        srcDoc={activeStep.result.sanitizedHtml}
                        className="mt-1.5 h-72 w-full rounded-lg border border-slate-200 bg-white dark:border-white/10"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Monitor className="h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Approve &amp; run a planned step to inspect live DOM structure, forms, tables, or workspace files here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
