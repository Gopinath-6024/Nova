import React, { useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  NovaProject,
  WorkspaceFileFormat,
  WorkspaceFileRecord,
} from '../../types/nova';
import {
  exportAsDocx,
  exportAsPptx,
  exportAsXlsx,
  exportTextFile,
  parseUploadedWorkspaceFile,
} from '../../utils/fileWorkspaceEngine';
import { createFormattedPdf, downloadBase64Pdf } from '../../utils/pdfEngine';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface FileWorkspaceModuleProps {
  activeProject: NovaProject | null;
  files: WorkspaceFileRecord[];
  onSaveFile: (file: WorkspaceFileRecord) => void;
  onDeleteFile: (id: string) => void;
}

function buildSectionsFromText(text: string): Array<{ heading: string; body: string }> {
  const blocks = text.split(/\n(?=##?\s+)/g).filter((b) => b.trim().length > 0);
  if (blocks.length === 0) return [{ heading: 'Document', body: text || 'Empty content' }];
  return blocks.map((blk, i) => {
    const lines = blk.split('\n');
    const first = lines[0].replace(/^#+\s*/, '').trim();
    const rest = lines.slice(1).join('\n').trim();
    return {
      heading: first || `Section ${i + 1}`,
      body: rest || first,
    };
  });
}

export const FileWorkspaceModule: React.FC<FileWorkspaceModuleProps> = ({
  activeProject,
  files,
  onSaveFile,
  onDeleteFile,
}) => {
  const [selectedId, setSelectedId] = useState<string>(files[0]?.id ?? '');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [versionNote, setVersionNote] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'table' | 'versions'>('edit');
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const currentFile = files.find((f) => f.id === selectedId) ?? files[0] ?? null;

  const handleUpload = async (fileList: FileList) => {
    setError(null);
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      try {
        const parsed = await parseUploadedWorkspaceFile(f);
        const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const rec: WorkspaceFileRecord = {
          id: `wfile-${Date.now()}-${i}`,
          projectId: activeProject?.id,
          name: parsed.name,
          format: parsed.format,
          contentText: parsed.contentText,
          tableHeaders: parsed.tableHeaders,
          tableRows: parsed.tableRows,
          versions: [
            {
              id: `ver-${Date.now()}`,
              version: 1,
              note: 'Imported file',
              contentText: parsed.contentText,
              savedAt: nowLabel,
            },
          ],
          updatedAt: nowLabel,
          updatedAtMs: Date.now(),
        };
        onSaveFile(rec);
        setSelectedId(rec.id);
        setViewMode(rec.tableHeaders?.length ? 'table' : 'edit');
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to parse ${f.name}`);
      }
    }
  };

  const handleNewBlank = (format: WorkspaceFileFormat) => {
    const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const starter =
      format === 'xlsx' || format === 'csv'
        ? 'Metric,Q1,Q2,Target\nLatency ms,142,118,100\nThroughput req/s,410,590,650'
        : `# Untitled ${format.toUpperCase()} Document\n\n## Executive Summary\nWrite or use AI Transform to populate structured sections.\n\n## Key Points\n- Item 1\n- Item 2`;
    const rec: WorkspaceFileRecord = {
      id: `wfile-${Date.now()}`,
      projectId: activeProject?.id,
      name: `nova-workspace-${files.length + 1}.${format}`,
      format,
      contentText: starter,
      tableHeaders:
        format === 'xlsx' || format === 'csv' ? ['Metric', 'Q1', 'Q2', 'Target'] : undefined,
      tableRows:
        format === 'xlsx' || format === 'csv'
          ? [
              ['Latency ms', '142', '118', '100'],
              ['Throughput req/s', '410', '590', '650'],
            ]
          : undefined,
      versions: [
        { id: `ver-${Date.now()}`, version: 1, note: 'Created blank file', contentText: starter, savedAt: nowLabel },
      ],
      updatedAt: nowLabel,
      updatedAtMs: Date.now(),
    };
    onSaveFile(rec);
    setSelectedId(rec.id);
    setViewMode(format === 'xlsx' || format === 'csv' ? 'table' : 'edit');
  };

  const handleAiTransform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || aiRunning) return;
    setAiRunning(true);
    setError(null);
    try {
      const targetFormat = currentFile?.format ?? 'docx';
      const resp = await fetch('/api/nova/files/ai-transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: aiPrompt.trim(),
          content: currentFile?.contentText ?? '',
          format: targetFormat,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'AI transform failed');

      const sectionsText = Array.isArray(data.sections)
        ? data.sections
            .map((s: { heading: string; body: string }) => `## ${s.heading}\n${s.body}`)
            .join('\n\n')
        : '';
      const composed = `# ${data.title || 'NOVA Generated Document'}\n\n${data.summary || ''}\n\n${sectionsText}`.trim();
      const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (currentFile) {
        const nextVerNum = currentFile.versions.length + 1;
        onSaveFile({
          ...currentFile,
          summary: data.summary || currentFile.summary,
          contentText: composed,
          tableHeaders:
            Array.isArray(data.tableHeaders) && data.tableHeaders.length > 0
              ? data.tableHeaders
              : currentFile.tableHeaders,
          tableRows:
            Array.isArray(data.tableRows) && data.tableRows.length > 0
              ? data.tableRows
              : currentFile.tableRows,
          versions: [
            {
              id: `ver-${Date.now()}`,
              version: nextVerNum,
              note: `AI: ${aiPrompt.trim().slice(0, 60)}`,
              contentText: composed,
              savedAt: nowLabel,
            },
            ...currentFile.versions,
          ],
          updatedAt: nowLabel,
          updatedAtMs: Date.now(),
        });
      } else {
        const rec: WorkspaceFileRecord = {
          id: `wfile-${Date.now()}`,
          projectId: activeProject?.id,
          name: `${data.title || 'ai-document'}.docx`,
          format: 'docx',
          summary: data.summary,
          contentText: composed,
          tableHeaders: data.tableHeaders,
          tableRows: data.tableRows,
          versions: [
            {
              id: `ver-${Date.now()}`,
              version: 1,
              note: `AI: ${aiPrompt.trim().slice(0, 60)}`,
              contentText: composed,
              savedAt: nowLabel,
            },
          ],
          updatedAt: nowLabel,
          updatedAtMs: Date.now(),
        };
        onSaveFile(rec);
        setSelectedId(rec.id);
      }
      setAiPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run AI document transformation');
    } finally {
      setAiRunning(false);
    }
  };

  const handleSaveSnapshot = () => {
    if (!currentFile) return;
    const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nextVer = currentFile.versions.length + 1;
    onSaveFile({
      ...currentFile,
      versions: [
        {
          id: `ver-${Date.now()}`,
          version: nextVer,
          note: versionNote.trim() || `Manual snapshot v${nextVer}`,
          contentText: currentFile.contentText,
          savedAt: nowLabel,
        },
        ...currentFile.versions,
      ],
      updatedAt: nowLabel,
      updatedAtMs: Date.now(),
    });
    setVersionNote('');
  };

  const handleExportFormat = async (fmt: WorkspaceFileFormat) => {
    if (!currentFile) return;
    const baseName = currentFile.name.replace(/\.[^.]+$/, '');
    const sections = buildSectionsFromText(currentFile.contentText);

    if (fmt === 'txt' || fmt === 'md') {
      exportTextFile(currentFile.contentText, baseName, fmt);
      return;
    }
    if (fmt === 'csv' || fmt === 'xlsx') {
      const headers = currentFile.tableHeaders ?? ['Section', 'Content'];
      const rows =
        currentFile.tableRows ?? sections.map((s) => [s.heading, s.body.replace(/\s+/g, ' ').slice(0, 200)]);
      exportAsXlsx({ title: baseName, headers, rows, format: fmt });
      return;
    }
    if (fmt === 'docx') {
      await exportAsDocx({
        title: baseName,
        subtitle: currentFile.summary,
        sections,
        tableHeaders: currentFile.tableHeaders,
        tableRows: currentFile.tableRows,
      });
      return;
    }
    if (fmt === 'pptx') {
      await exportAsPptx({
        title: baseName,
        subtitle: currentFile.summary,
        sections,
      });
      return;
    }
    if (fmt === 'pdf') {
      const pdf = createFormattedPdf({
        title: baseName,
        subtitle: currentFile.summary || 'NOVA Multi-Format File Workspace Export',
        author: 'NOVA File Workspace',
        sections: sections.map((s) => ({
          heading: s.heading,
          paragraphs: s.body.split('\n\n').filter(Boolean),
        })),
      });
      downloadBase64Pdf(pdf.base64Data, baseName);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>PDF, DOCX, XLSX, PPTX, CSV &amp; Markdown</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              NOVA File Workspace
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Import real office &amp; spreadsheet documents, transform them with AI, track version snapshots, and export binary files across formats.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={uploadRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls,.pptx,.csv,.txt,.md"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleUpload(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white"
            >
              <Upload className="h-3.5 w-3.5" />
              Import File
            </button>
            <button
              type="button"
              onClick={() => handleNewBlank('docx')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New Document
            </button>
            <button
              type="button"
              onClick={() => handleNewBlank('xlsx')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              New Sheet
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-[#0D0A19]">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Workspace Files ({files.length})
              </div>
              {files.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Import a PDF/DOCX/XLSX/PPTX/CSV or create a new document to start.
                </p>
              ) : (
                <div className="mt-2.5 space-y-2">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => setSelectedId(f.id)}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 transition ${
                        currentFile?.id === f.id
                          ? 'border-violet-500 bg-violet-50 dark:border-violet-500 dark:bg-violet-500/10'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                          {f.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                          <span className="uppercase">{f.format}</span>
                          <span>v{f.versions.length}</span>
                          <span>{f.updatedAt}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFile(f.id);
                        }}
                        aria-label={`Delete ${f.name}`}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={handleAiTransform}
              className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-[#0D0A19]"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                <Sparkles className="h-3.5 w-3.5" />
                <span>AI Document Transform / Create</span>
              </div>
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., Restructure into an executive slide deck outline with KPI table, or expand section 2 with metrics."
                className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
              <button
                type="submit"
                disabled={aiRunning || !aiPrompt.trim()}
                className="mt-2.5 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiRunning ? 'Transforming...' : currentFile ? 'Transform Active File' : 'Generate New Document'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-8">
            {currentFile ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0D0A19]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-violet-500" />
                    <input
                      type="text"
                      value={currentFile.name}
                      onChange={(e) => onSaveFile({ ...currentFile, name: e.target.value })}
                      className="rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-violet-500 focus:outline-none dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {(['edit', 'preview', 'table', 'versions'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setViewMode(tab)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                          viewMode === tab
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
                        }`}
                      >
                        {tab === 'versions' ? `Versions (${currentFile.versions.length})` : tab}
                      </button>
                    ))}
                  </div>
                </div>

                {viewMode === 'edit' && (
                  <div className="mt-3 space-y-3">
                    <textarea
                      rows={15}
                      value={currentFile.contentText}
                      onChange={(e) =>
                        onSaveFile({
                          ...currentFile,
                          contentText: e.target.value,
                          updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          updatedAtMs: Date.now(),
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-black/40 dark:text-slate-100"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={versionNote}
                        onChange={(e) => setVersionNote(e.target.value)}
                        placeholder="Snapshot label (optional)"
                        className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 dark:border-white/10 dark:bg-black/30 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleSaveSnapshot}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white"
                      >
                        <History className="h-3.5 w-3.5" />
                        Save Version Snapshot
                      </button>
                    </div>
                  </div>
                )}

                {viewMode === 'preview' && (
                  <div className="mt-3 max-h-[460px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-white/10 dark:bg-black/25">
                    <MarkdownRenderer content={currentFile.contentText} />
                  </div>
                )}

                {viewMode === 'table' && (
                  <div className="mt-3 overflow-x-auto">
                    {currentFile.tableHeaders && currentFile.tableHeaders.length > 0 ? (
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                            {currentFile.tableHeaders.map((h, hi) => (
                              <th key={hi} className="px-3 py-2 font-semibold text-slate-800 dark:text-white">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(currentFile.tableRows ?? []).map((row, ri) => (
                            <tr key={ri} className="border-b border-slate-100 dark:border-white/5">
                              {currentFile.tableHeaders!.map((_, ci) => (
                                <td key={ci} className="p-1">
                                  <input
                                    type="text"
                                    value={row[ci] ?? ''}
                                    onChange={(e) => {
                                      const nextRows = (currentFile.tableRows ?? []).map((r, rIdx) =>
                                        rIdx === ri ? r.map((v, cIdx) => (cIdx === ci ? e.target.value : v)) : r
                                      );
                                      onSaveFile({ ...currentFile, tableRows: nextRows, updatedAtMs: Date.now() });
                                    }}
                                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-xs text-slate-700 focus:border-violet-500 focus:bg-white dark:text-slate-200 dark:focus:bg-black/40"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                        No structured table extracted yet. Import CSV/XLSX or run AI Transform to synthesize tabular data.
                      </p>
                    )}
                  </div>
                )}

                {viewMode === 'versions' && (
                  <div className="mt-3 space-y-2">
                    {currentFile.versions.map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-white/10 dark:bg-white/[0.02]"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            v{v.version} — {v.note}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                            Saved {v.savedAt} · {v.contentText.length} chars
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onSaveFile({
                              ...currentFile,
                              contentText: v.contentText,
                              updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                              updatedAtMs: Date.now(),
                            });
                            setViewMode('edit');
                          }}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Export As Real Binary / Formatted File
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'md', 'txt'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => handleExportFormat(fmt)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase text-slate-800 hover:border-violet-400 hover:bg-violet-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-violet-500/15"
                      >
                        <Download className="h-3.5 w-3.5 text-violet-500" />
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-white/15 dark:bg-white/[0.02]">
                <FileText className="h-9 w-9 text-violet-500" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                  Multi-Format Office &amp; AI File Engine
                </h3>
                <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  Upload PDF, DOCX, XLSX, PPTX, CSV, Markdown, or TXT files — or create one from scratch — to inspect tables, track versions, and export cleanly.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
