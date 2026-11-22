import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Camera,
  Download,
  Eye,
  FileEdit,
  FilePlus2,
  FileText,
  Image as ImageIcon,
  Layers,
  Plus,
  Search,
  Sparkles,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  GeneratedImageRecord,
  GeneratedPdfRecord,
  PdfContentBlock,
  PdfLayoutConfig,
  RealPhotoSearchResult,
} from '../../types/nova';
import {
  DEFAULT_PDF_LAYOUT_CONFIG,
  base64PdfToBlobUrl,
  createRichPdfAsync,
  downloadBase64Pdf,
  modifyExistingPdf,
  uint8ToBase64,
} from '../../utils/pdfEngine';
import { NovaMiniPlanetLoader } from '../NovaCoreOrb';
import type { StagedPdfImagePayload } from './ImageStudioModule';

interface PdfStudioModuleProps {
  isOffline: boolean;
  savedImages: GeneratedImageRecord[];
  savedPdfs: GeneratedPdfRecord[];
  stagedMedia?: StagedPdfImagePayload | null;
  onClearStagedMedia?: () => void;
  onSavePdf: (pdf: GeneratedPdfRecord) => void;
  onDeletePdf: (id: string) => void;
  onIndexCreatedItem: (item: {
    title: string;
    subtitle: string;
    type: 'pdf' | 'image';
    sizeOrMeta: string;
    contentPreview?: string;
  }) => void;
  onOpenImageStudio?: () => void;
}

const DEFAULT_SAMPLE_BLOCKS: PdfContentBlock[] = [
  {
    id: 'blk-sec-1',
    kind: 'section',
    heading: 'Executive Summary',
    paragraphs: [
      'This document was composed inside NOVA PDF Studio. Edit any section below, insert AI-generated graphics, uploaded photos, or verified Wikimedia/stock photographs, customize fonts and margins, or run AI layout synthesis from raw documents.',
    ],
    bullets: [
      'Supports Helvetica, Times Serif, and Courier Monospace',
      'Live vector Bar, Line, and Pie chart rendering in exported PDFs',
      'Strict attribution tracking when embedding licensed real photographs',
    ],
  },
];

export const PdfStudioModule: React.FC<PdfStudioModuleProps> = ({
  isOffline,
  savedImages,
  savedPdfs,
  stagedMedia = null,
  onClearStagedMedia,
  onSavePdf,
  onDeletePdf,
  onIndexCreatedItem,
  onOpenImageStudio,
}) => {
  const [workspaceMode, setWorkspaceMode] = useState<'compose' | 'modify'>('compose');

  // Composer State
  const [docTitle, setDocTitle] = useState('NOVA Executive Brief');
  const [docSubtitle, setDocSubtitle] = useState('Compiled report with embedded visuals and data');
  const [docAuthor, setDocAuthor] = useState('NOVA PDF Studio');
  const [layoutConfig, setLayoutConfig] = useState<PdfLayoutConfig>(DEFAULT_PDF_LAYOUT_CONFIG);
  const [blocks, setBlocks] = useState<PdfContentBlock[]>(DEFAULT_SAMPLE_BLOCKS);

  // AI / Source Input State
  const [aiInstructions, setAiInstructions] = useState('');
  const [sourceDocText, setSourceDocText] = useState('');
  const [aiTone, setAiTone] = useState<'professional' | 'academic' | 'concise' | 'creative'>('professional');
  const [includeTable, setIncludeTable] = useState(true);
  const [includeChart, setIncludeChart] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);

  // Image Picker inside PDF Composer
  const [showPhotoSearchDrawer, setShowPhotoSearchDrawer] = useState(false);
  const [inlinePhotoQuery, setInlinePhotoQuery] = useState('');
  const [inlinePhotoResults, setInlinePhotoResults] = useState<RealPhotoSearchResult[]>([]);
  const [inlinePhotoBusy, setInlinePhotoBusy] = useState(false);

  // Active Compiled PDF + Preview
  const [activePdf, setActivePdf] = useState<GeneratedPdfRecord | null>(savedPdfs[0] ?? null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewView, setPreviewView] = useState<'native' | 'sheet'>('native');
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Existing PDF Modifier State (preserves pdf-lib capabilities)
  const [editingPdf, setEditingPdf] = useState<GeneratedPdfRecord | null>(savedPdfs[0] ?? null);
  const [editTitle, setEditTitle] = useState(savedPdfs[0]?.title ?? '');
  const [editWatermark, setEditWatermark] = useState('');
  const [editAppendHeading, setEditAppendHeading] = useState('');
  const [editAppendBody, setEditAppendBody] = useState('');
  const [editNotePage, setEditNotePage] = useState(1);
  const [editNoteText, setEditNoteText] = useState('');
  const [editDeletePages, setEditDeletePages] = useState('');
  const [pdfModifying, setPdfModifying] = useState(false);

  const sourceDocInputRef = useRef<HTMLInputElement>(null);
  const photoUploadInputRef = useRef<HTMLInputElement>(null);
  const pdfUploadInputRef = useRef<HTMLInputElement>(null);

  // Rebuild Blob URL whenever activePdf changes
  useEffect(() => {
    if (!activePdf?.base64Data) {
      setPreviewBlobUrl(null);
      return;
    }
    const url = base64PdfToBlobUrl(activePdf.base64Data);
    setPreviewBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activePdf]);

  // Compile helper
  const rebuildAndSavePdf = async (
    nextBlocks: PdfContentBlock[],
    nextTitle = docTitle,
    nextSubtitle = docSubtitle,
    nextAuthor = docAuthor,
    nextConfig = layoutConfig,
    saveToLibrary = true
  ) => {
    setBuildingPdf(true);
    setPdfError(null);
    try {
      const record = await createRichPdfAsync({
        title: nextTitle,
        subtitle: nextSubtitle,
        author: nextAuthor,
        blocks: nextBlocks,
        config: nextConfig,
      });
      setActivePdf(record);
      setEditingPdf(record);
      setEditTitle(record.title);
      if (saveToLibrary) {
        onSavePdf(record);
        onIndexCreatedItem({
          title: `${record.title.replace(/[^a-z0-9_-]+/gi, '_')}.pdf`,
          subtitle: `PDF Studio · ${record.pageCount} page(s) · ${nextConfig.pageSize.toUpperCase()}`,
          type: 'pdf',
          sizeOrMeta: `${record.pageCount}p`,
          contentPreview: record.sections[0]?.paragraphs[0],
        });
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Unable to compile PDF document.');
    } finally {
      setBuildingPdf(false);
    }
  };

  // Auto-insert image when sent from Image Studio
  useEffect(() => {
    if (!stagedMedia) return;
    const newImgBlock: PdfContentBlock = {
      id: `blk-img-${Date.now()}`,
      kind: 'image',
      caption: stagedMedia.caption,
      dataUrl: stagedMedia.dataUrl,
      sourceKind: stagedMedia.sourceKind,
      attribution: stagedMedia.attribution,
      widthPercent: 75,
      align: 'center',
    };
    setWorkspaceMode('compose');
    setBlocks((prev) => {
      const updated = [...prev, newImgBlock];
      void rebuildAndSavePdf(updated, docTitle, docSubtitle, docAuthor, layoutConfig, false);
      return updated;
    });
    onClearStagedMedia?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedMedia]);

  const handleUploadSourceDocument = async (file: File) => {
    try {
      if (file.type === 'application/pdf') {
        const buf = await file.arrayBuffer();
        const base64 = uint8ToBase64(new Uint8Array(buf));
        const { pageCount } = await modifyExistingPdf({ base64Data: base64 });
        const uploadedRec: GeneratedPdfRecord = {
          id: `pdf-${Date.now()}`,
          title: file.name.replace(/\.pdf$/i, ''),
          subtitle: `Uploaded PDF · ${pageCount} pages`,
          pageCount,
          base64Data: base64,
          sections: [],
          updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        onSavePdf(uploadedRec);
        setActivePdf(uploadedRec);
        setEditingPdf(uploadedRec);
        setEditTitle(uploadedRec.title);
        setWorkspaceMode('modify');
      } else {
        const text = await file.text();
        setSourceDocText(text);
        if (!docTitle.trim() || docTitle === 'NOVA Executive Brief') {
          setDocTitle(file.name.replace(/\.[^.]+$/, ''));
        }
      }
    } catch {
      setPdfError('Could not read uploaded document.');
    }
  };

  const handleSynthesizeWithAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInstructions.trim() && !sourceDocText.trim()) return;
    setSynthesizing(true);
    setPdfError(null);

    try {
      if (isOffline) {
        // Structured offline document composer from pasted text/instructions
        const rawText = (sourceDocText || aiInstructions).trim();
        const chunks = rawText
          .split(/\n{2,}/)
          .map((c) => c.trim())
          .filter(Boolean);
        const generatedBlocks: PdfContentBlock[] = [
          {
            id: `blk-sec-${Date.now()}`,
            kind: 'section',
            heading: aiInstructions.trim() || 'Document Summary',
            paragraphs: chunks.length > 0 ? chunks : [rawText],
            bullets: ['Composed locally in NOVA Offline Mode'],
          },
        ];
        setBlocks((prev) => [...prev.filter((b) => b.kind === 'image'), ...generatedBlocks]);
        await rebuildAndSavePdf(
          [...blocks.filter((b) => b.kind === 'image'), ...generatedBlocks],
          docTitle,
          docSubtitle,
          docAuthor,
          layoutConfig
        );
        return;
      }

      const res = await fetch('/api/nova/media-studio/generate-pdf-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions: aiInstructions.trim(),
          sourceText: sourceDocText.trim(),
          title: docTitle.trim(),
          tone: aiTone,
          includeTable,
          includeChart,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.blueprint) {
        throw new Error(data.error || 'PDF blueprint generation failed.');
      }

      const bp = data.blueprint as {
        title?: string;
        subtitle?: string;
        author?: string;
        sections?: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
        tables?: Array<{ title: string; headers: string[]; rows: string[][] }>;
        charts?: Array<{
          title: string;
          chartType: string;
          unitLabel?: string;
          data: Array<{ label: string; value: number }>;
        }>;
      };

      const nextTitle = bp.title || docTitle;
      const nextSub = bp.subtitle || docSubtitle;
      const nextAuthor = bp.author || docAuthor;
      setDocTitle(nextTitle);
      setDocSubtitle(nextSub);
      setDocAuthor(nextAuthor);

      const newBlocks: PdfContentBlock[] = [];
      (bp.sections || []).forEach((s, idx) => {
        newBlocks.push({
          id: `blk-sec-${Date.now()}-${idx}`,
          kind: 'section',
          heading: s.heading || `Section ${idx + 1}`,
          paragraphs: Array.isArray(s.paragraphs) ? s.paragraphs : [],
          bullets: Array.isArray(s.bullets) ? s.bullets : [],
        });
      });

      // Keep any images already staged by the user inside this draft
      const existingImages = blocks.filter((b) => b.kind === 'image');
      newBlocks.push(...existingImages);

      (bp.tables || []).forEach((t, idx) => {
        if (Array.isArray(t.headers) && t.headers.length > 0) {
          newBlocks.push({
            id: `blk-tbl-${Date.now()}-${idx}`,
            kind: 'table',
            title: t.title || 'Summary Table',
            headers: t.headers,
            rows: Array.isArray(t.rows) ? t.rows : [],
          });
        }
      });

      (bp.charts || []).forEach((c, idx) => {
        if (Array.isArray(c.data) && c.data.length > 0) {
          const kind = c.chartType === 'line' || c.chartType === 'pie' ? c.chartType : 'bar';
          newBlocks.push({
            id: `blk-cht-${Date.now()}-${idx}`,
            kind: 'chart',
            title: c.title || 'Performance Chart',
            chartType: kind,
            unitLabel: c.unitLabel,
            data: c.data,
          });
        }
      });

      setBlocks(newBlocks);
      await rebuildAndSavePdf(newBlocks, nextTitle, nextSub, nextAuthor, layoutConfig, true);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Unable to generate PDF layout.');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleInlinePhotoSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlinePhotoQuery.trim()) return;
    setInlinePhotoBusy(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/nova/media-studio/search-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: inlinePhotoQuery.trim(), provider: 'auto', perPage: 6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Real photo lookup failed.');
      setInlinePhotoResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Photo search unavailable.');
    } finally {
      setInlinePhotoBusy(false);
    }
  };

  const handleInsertInlineRealPhoto = async (photo: RealPhotoSearchResult) => {
    setInlinePhotoBusy(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/nova/media-studio/proxy-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: photo.fullUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.dataUrl) throw new Error(data.error || 'Could not load photo bytes.');

      const imgBlock: PdfContentBlock = {
        id: `blk-img-${Date.now()}`,
        kind: 'image',
        caption: photo.title,
        dataUrl: data.dataUrl,
        sourceKind: 'real_photo',
        attribution: photo.attributionText,
        widthPercent: 75,
        align: 'center',
      };
      const updated = [...blocks, imgBlock];
      setBlocks(updated);
      setShowPhotoSearchDrawer(false);
      await rebuildAndSavePdf(updated, docTitle, docSubtitle, docAuthor, layoutConfig, false);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to embed photo in PDF.');
    } finally {
      setInlinePhotoBusy(false);
    }
  };

  const handleUploadImageBlock = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const url = String(reader.result || '');
      if (!url) return;
      const imgBlock: PdfContentBlock = {
        id: `blk-img-${Date.now()}`,
        kind: 'image',
        caption: file.name.replace(/\.[^.]+$/, ''),
        dataUrl: url,
        sourceKind: 'uploaded',
        widthPercent: 75,
        align: 'center',
      };
      const updated = [...blocks, imgBlock];
      setBlocks(updated);
      void rebuildAndSavePdf(updated, docTitle, docSubtitle, docAuthor, layoutConfig, false);
    };
    reader.readAsDataURL(file);
  };

  const addSectionBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: `blk-sec-${Date.now()}`,
        kind: 'section',
        heading: 'New Section',
        paragraphs: ['Add your section commentary here.'],
        bullets: [],
      },
    ]);
  };

  const addTableBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: `blk-tbl-${Date.now()}`,
        kind: 'table',
        title: 'Key Metrics Table',
        headers: ['Category', 'Metric', 'Status'],
        rows: [
          ['Throughput', '98.4%', 'Optimal'],
          ['Efficiency', '+24%', 'Verified'],
        ],
      },
    ]);
  };

  const addChartBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: `blk-cht-${Date.now()}`,
        kind: 'chart',
        title: 'Quarterly Growth Chart',
        chartType: 'bar',
        unitLabel: 'Index',
        data: [
          { label: 'Q1', value: 42 },
          { label: 'Q2', value: 64 },
          { label: 'Q3', value: 79 },
          { label: 'Q4', value: 95 },
        ],
      },
    ]);
  };

  const moveBlock = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const updateBlock = (idx: number, next: PdfContentBlock) => {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? next : b)));
  };

  const removeBlock = (idx: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleApplyPdfEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPdf) return;
    setPdfModifying(true);
    setPdfError(null);
    try {
      const deleteIndexes = editDeletePages
        .split(',')
        .map((n) => parseInt(n.trim(), 10) - 1)
        .filter((n) => !Number.isNaN(n) && n >= 0);

      const updated = await modifyExistingPdf({
        base64Data: editingPdf.base64Data,
        newTitle: editTitle.trim() || editingPdf.title,
        watermarkText: editWatermark.trim() || undefined,
        appendHeading: editAppendHeading.trim() || undefined,
        appendBody: editAppendBody.trim() || undefined,
        overlayNote: editNoteText.trim()
          ? { pageIndex: Math.max(0, editNotePage - 1), text: editNoteText.trim() }
          : undefined,
        deletePageIndexes: deleteIndexes,
      });

      const nextRecord: GeneratedPdfRecord = {
        ...editingPdf,
        title: editTitle.trim() || editingPdf.title,
        pageCount: updated.pageCount,
        subtitle: `${updated.pageCount} pages · Modified`,
        base64Data: updated.base64Data,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      onSavePdf(nextRecord);
      setEditingPdf(nextRecord);
      setActivePdf(nextRecord);
      setEditWatermark('');
      setEditAppendHeading('');
      setEditAppendBody('');
      setEditNoteText('');
      setEditDeletePages('');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Unable to modify PDF.');
    } finally {
      setPdfModifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
            NOVA PDF Studio
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Design structured PDFs from AI, documents, tables, charts, AI art &amp; real licensed photographs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#181228] p-1">
            <button
              type="button"
              onClick={() => setWorkspaceMode('compose')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                workspaceMode === 'compose'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>PDF Composer</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('modify')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                workspaceMode === 'modify'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileEdit className="h-3.5 w-3.5" />
              <span>Modify &amp; Stamp</span>
            </button>
          </div>

          {activePdf && (
            <button
              type="button"
              onClick={() => downloadBase64Pdf(activePdf.base64Data, activePdf.title)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export PDF</span>
            </button>
          )}
        </div>
      </div>

      {pdfError && (
        <div className="rounded-xl border border-rose-400/35 bg-rose-50 dark:bg-rose-950/35 p-3.5 text-xs text-rose-800 dark:text-rose-200">
          {pdfError}
        </div>
      )}

      {workspaceMode === 'compose' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: AI Generator + Page Settings + Block Composer */}
          <div className="lg:col-span-6 space-y-5">
            {/* 1. AI & Source Text Generator */}
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  1. Draft from Instructions or Document
                </h3>
                <div>
                  <input
                    ref={sourceDocInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadSourceDocument(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => sourceDocInputRef.current?.click()}
                    className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/15 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-violet-400"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Import File</span>
                  </button>
                </div>
              </div>

              <form onSubmit={(e) => void handleSynthesizeWithAi(e)} className="space-y-3">
                <textarea
                  rows={2}
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  placeholder="Instructions (e.g. 'Create an executive renewable energy brief with Q1-Q4 growth chart and comparison table')"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                />
                <textarea
                  rows={2}
                  value={sourceDocText}
                  onChange={(e) => setSourceDocText(e.target.value)}
                  placeholder="Optional raw notes, CSV data, or pasted document text to format cleanly..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
                    <select
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value as typeof aiTone)}
                      className="min-h-[36px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs focus:border-violet-400 focus:outline-none"
                    >
                      <option value="professional">Professional</option>
                      <option value="academic">Academic</option>
                      <option value="concise">Executive</option>
                      <option value="creative">Editorial</option>
                    </select>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeTable}
                        onChange={(e) => setIncludeTable(e.target.checked)}
                        className="accent-violet-600"
                      />
                      <span>Table</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeChart}
                        onChange={(e) => setIncludeChart(e.target.checked)}
                        className="accent-violet-600"
                      />
                      <span>Chart</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={synthesizing || (!aiInstructions.trim() && !sourceDocText.trim())}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    <Sparkles className={`h-3.5 w-3.5 ${synthesizing ? 'animate-spin' : ''}`} />
                    <span>{synthesizing ? 'Drafting...' : 'AI Draft Layout'}</span>
                  </button>
                </div>
              </form>
            </section>

            {/* 2. Page Layout & Typography */}
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-3.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                2. Page Setup, Fonts &amp; Margins
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Document Title"
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
                />
                <input
                  type="text"
                  value={docAuthor}
                  onChange={(e) => setDocAuthor(e.target.value)}
                  placeholder="Author / Organization"
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
                />
              </div>

              <input
                type="text"
                value={docSubtitle}
                onChange={(e) => setDocSubtitle(e.target.value)}
                placeholder="Subtitle or brief context"
                className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
              />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                    Template
                  </label>
                  <select
                    value={layoutConfig.template}
                    onChange={(e) =>
                      setLayoutConfig((c) => ({
                        ...c,
                        template: e.target.value as PdfLayoutConfig['template'],
                      }))
                    }
                    className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs"
                  >
                    <option value="executive">Executive</option>
                    <option value="minimal">Minimal</option>
                    <option value="academic">Academic</option>
                    <option value="portfolio">Portfolio Bar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                    Font Family
                  </label>
                  <select
                    value={layoutConfig.fontFamily}
                    onChange={(e) =>
                      setLayoutConfig((c) => ({
                        ...c,
                        fontFamily: e.target.value as PdfLayoutConfig['fontFamily'],
                      }))
                    }
                    className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs"
                  >
                    <option value="helvetica">Helvetica Sans</option>
                    <option value="times">Times Serif</option>
                    <option value="courier">Courier Mono</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                    Alignment
                  </label>
                  <select
                    value={layoutConfig.textAlign}
                    onChange={(e) =>
                      setLayoutConfig((c) => ({
                        ...c,
                        textAlign: e.target.value as PdfLayoutConfig['textAlign'],
                      }))
                    }
                    className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs"
                  >
                    <option value="left">Align Left</option>
                    <option value="justify">Justified</option>
                    <option value="center">Centered</option>
                    <option value="right">Align Right</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                    Page Size
                  </label>
                  <select
                    value={layoutConfig.pageSize}
                    onChange={(e) =>
                      setLayoutConfig((c) => ({
                        ...c,
                        pageSize: e.target.value as PdfLayoutConfig['pageSize'],
                      }))
                    }
                    className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs"
                  >
                    <option value="a4">A4 (Standard)</option>
                    <option value="letter">US Letter</option>
                    <option value="legal">US Legal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                    Orientation
                  </label>
                  <select
                    value={layoutConfig.orientation}
                    onChange={(e) =>
                      setLayoutConfig((c) => ({
                        ...c,
                        orientation: e.target.value as PdfLayoutConfig['orientation'],
                      }))
                    }
                    className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs"
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                    Margins
                  </label>
                  <select
                    value={layoutConfig.marginPreset}
                    onChange={(e) =>
                      setLayoutConfig((c) => ({
                        ...c,
                        marginPreset: e.target.value as PdfLayoutConfig['marginPreset'],
                      }))
                    }
                    className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs"
                  >
                    <option value="compact">Compact (34pt)</option>
                    <option value="standard">Standard (52pt)</option>
                    <option value="wide">Wide (72pt)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-4 text-xs text-slate-700 dark:text-slate-300">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layoutConfig.includePageNumbers}
                      onChange={(e) =>
                        setLayoutConfig((c) => ({ ...c, includePageNumbers: e.target.checked }))
                      }
                      className="accent-violet-600"
                    />
                    <span>Page Numbers</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layoutConfig.includeHeaderRule}
                      onChange={(e) =>
                        setLayoutConfig((c) => ({ ...c, includeHeaderRule: e.target.checked }))
                      }
                      className="accent-violet-600"
                    />
                    <span>Header Rule</span>
                  </label>
                </div>

                <button
                  type="button"
                  disabled={buildingPdf}
                  onClick={() =>
                    void rebuildAndSavePdf(blocks, docTitle, docSubtitle, docAuthor, layoutConfig, true)
                  }
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>{buildingPdf ? 'Compiling PDF...' : 'Build & Save PDF'}</span>
                </button>
              </div>
            </section>

            {/* 3. Interactive Block Composer + Media Inserter */}
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  3. Content Blocks ({blocks.length})
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={addSectionBlock}
                    className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 px-2.5 text-[11px] font-medium hover:border-violet-400"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Section</span>
                  </button>
                  <button
                    type="button"
                    onClick={addTableBlock}
                    className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 px-2.5 text-[11px] font-medium hover:border-violet-400"
                  >
                    <Table2 className="h-3 w-3" />
                    <span>Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={addChartBlock}
                    className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 px-2.5 text-[11px] font-medium hover:border-violet-400"
                  >
                    <BarChart3 className="h-3 w-3" />
                    <span>Chart</span>
                  </button>
                  <input
                    ref={photoUploadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadImageBlock(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => photoUploadInputRef.current?.click()}
                    className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 px-2.5 text-[11px] font-medium hover:border-violet-400"
                  >
                    <Upload className="h-3 w-3" />
                    <span>Upload Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPhotoSearchDrawer((v) => !v)}
                    className="flex min-h-[34px] items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                  >
                    <Camera className="h-3 w-3" />
                    <span>Real / AI Images</span>
                  </button>
                </div>
              </div>

              {/* Inline Picker: Gallery + Real Photo Search */}
              {showPhotoSearchDrawer && (
                <div className="rounded-xl border border-violet-400/25 bg-slate-50 dark:bg-[#181228] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Insert from NOVA Gallery or Real Photo Search
                    </span>
                    {onOpenImageStudio && (
                      <button
                        type="button"
                        onClick={onOpenImageStudio}
                        className="text-[11px] font-medium text-violet-600 dark:text-violet-300 hover:underline"
                      >
                        Open Image Studio
                      </button>
                    )}
                  </div>

                  {savedImages.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {savedImages.slice(0, 8).map((img) => {
                        const kind = img.sourceKind || 'ai_generated';
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => {
                              const imgBlock: PdfContentBlock = {
                                id: `blk-img-${Date.now()}`,
                                kind: 'image',
                                caption: img.prompt,
                                dataUrl: img.dataUrl,
                                sourceKind: kind,
                                attribution: img.attribution,
                                widthPercent: 75,
                                align: 'center',
                              };
                              const updated = [...blocks, imgBlock];
                              setBlocks(updated);
                              setShowPhotoSearchDrawer(false);
                              void rebuildAndSavePdf(
                                updated,
                                docTitle,
                                docSubtitle,
                                docAuthor,
                                layoutConfig,
                                false
                              );
                            }}
                            className="relative shrink-0 w-24 rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden text-left hover:border-violet-500"
                          >
                            <img
                              src={img.dataUrl}
                              alt={img.prompt}
                              className="h-16 w-24 object-cover"
                            />
                            <div className="p-1 text-[9px] truncate bg-white dark:bg-[#120D1F]">
                              {kind === 'ai_generated' ? 'AI' : kind === 'real_photo' ? 'Real' : 'Upload'}:{' '}
                              {img.prompt}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <form onSubmit={(e) => void handleInlinePhotoSearch(e)} className="flex gap-2">
                    <input
                      type="search"
                      value={inlinePhotoQuery}
                      onChange={(e) => setInlinePhotoQuery(e.target.value)}
                      placeholder="Search Wikimedia / Pexels real photos to embed..."
                      className="flex-1 min-h-[36px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-3 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={inlinePhotoBusy || !inlinePhotoQuery.trim()}
                      className="flex min-h-[36px] items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>{inlinePhotoBusy ? '...' : 'Find'}</span>
                    </button>
                  </form>

                  {inlinePhotoResults.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {inlinePhotoResults.map((ph) => (
                        <button
                          key={ph.id}
                          type="button"
                          disabled={inlinePhotoBusy}
                          onClick={() => void handleInsertInlineRealPhoto(ph)}
                          className="rounded-lg border border-white/10 overflow-hidden text-left hover:border-emerald-400"
                        >
                          <img
                            src={ph.thumbUrl}
                            alt={ph.title}
                            referrerPolicy="no-referrer"
                            className="h-16 w-full object-cover"
                          />
                          <div className="p-1 text-[10px] truncate">{ph.photographer}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Block List Editors */}
              <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                {blocks.map((blk, idx) => (
                  <div
                    key={blk.id}
                    className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-300">
                        {blk.kind === 'section'
                          ? 'Text Section'
                          : blk.kind === 'image'
                          ? blk.sourceKind === 'ai_generated'
                            ? 'Image · AI Generated'
                            : blk.sourceKind === 'real_photo'
                            ? 'Image · Real Photo'
                            : 'Image · Uploaded'
                          : blk.kind === 'table'
                          ? 'Data Table'
                          : `Vector Chart (${blk.chartType})`}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveBlock(idx, -1)}
                          aria-label="Move block up"
                          className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBlock(idx, 1)}
                          aria-label="Move block down"
                          className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBlock(idx)}
                          aria-label="Remove block"
                          className="p-1 text-slate-500 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {blk.kind === 'section' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={blk.heading}
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, heading: e.target.value })
                          }
                          placeholder="Section Heading"
                          className="w-full min-h-[36px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2.5 text-xs font-semibold"
                        />
                        <textarea
                          rows={3}
                          value={blk.paragraphs.join('\n\n')}
                          onChange={(e) =>
                            updateBlock(idx, {
                              ...blk,
                              paragraphs: e.target.value.split('\n\n'),
                            })
                          }
                          placeholder="Paragraphs separated by blank lines..."
                          className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-2.5 text-xs"
                        />
                        <input
                          type="text"
                          value={blk.bullets.join(' | ')}
                          onChange={(e) =>
                            updateBlock(idx, {
                              ...blk,
                              bullets: e.target.value
                                .split('|')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="Optional bullet points separated by |"
                          className="w-full min-h-[34px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2.5 text-[11px]"
                        />
                      </div>
                    )}

                    {blk.kind === 'image' && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-3">
                          <img
                            src={blk.dataUrl}
                            alt={blk.caption}
                            className="h-16 w-24 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={blk.caption}
                              onChange={(e) =>
                                updateBlock(idx, { ...blk, caption: e.target.value })
                              }
                              placeholder="Image caption"
                              className="w-full min-h-[34px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2.5 text-xs"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={blk.widthPercent}
                                onChange={(e) =>
                                  updateBlock(idx, {
                                    ...blk,
                                    widthPercent: Number(e.target.value) as 50 | 75 | 100,
                                  })
                                }
                                className="min-h-[32px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2 text-[11px]"
                              >
                                <option value={50}>Width: 50%</option>
                                <option value={75}>Width: 75%</option>
                                <option value={100}>Width: 100%</option>
                              </select>
                              <select
                                value={blk.align}
                                onChange={(e) =>
                                  updateBlock(idx, {
                                    ...blk,
                                    align: e.target.value as 'left' | 'center' | 'right',
                                  })
                                }
                                className="min-h-[32px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2 text-[11px]"
                              >
                                <option value="left">Align Left</option>
                                <option value="center">Align Center</option>
                                <option value="right">Align Right</option>
                              </select>
                            </div>
                          </div>
                        </div>
                        {blk.attribution && (
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                            Attribution included: {blk.attribution}
                          </div>
                        )}
                      </div>
                    )}

                    {blk.kind === 'table' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={blk.title}
                          onChange={(e) => updateBlock(idx, { ...blk, title: e.target.value })}
                          placeholder="Table Title"
                          className="w-full min-h-[34px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2.5 text-xs font-semibold"
                        />
                        <input
                          type="text"
                          value={blk.headers.join(' | ')}
                          onChange={(e) =>
                            updateBlock(idx, {
                              ...blk,
                              headers: e.target.value.split('|').map((s) => s.trim()),
                            })
                          }
                          placeholder="Headers separated by |"
                          className="w-full min-h-[34px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2.5 text-[11px] font-mono"
                        />
                        <textarea
                          rows={3}
                          value={blk.rows.map((r) => r.join(' | ')).join('\n')}
                          onChange={(e) =>
                            updateBlock(idx, {
                              ...blk,
                              rows: e.target.value
                                .split('\n')
                                .filter((line) => line.trim())
                                .map((line) => line.split('|').map((c) => c.trim())),
                            })
                          }
                          placeholder="One row per line, columns separated by |"
                          className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-2 text-[11px] font-mono"
                        />
                      </div>
                    )}

                    {blk.kind === 'chart' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={blk.title}
                            onChange={(e) => updateBlock(idx, { ...blk, title: e.target.value })}
                            placeholder="Chart Title"
                            className="min-h-[34px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2.5 text-xs font-semibold"
                          />
                          <select
                            value={blk.chartType}
                            onChange={(e) =>
                              updateBlock(idx, {
                                ...blk,
                                chartType: e.target.value as 'bar' | 'line' | 'pie',
                              })
                            }
                            className="min-h-[34px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-2 text-xs"
                          >
                            <option value="bar">Bar Chart</option>
                            <option value="line">Line Chart</option>
                            <option value="pie">Pie Chart</option>
                          </select>
                        </div>
                        <textarea
                          rows={3}
                          value={blk.data.map((d) => `${d.label}: ${d.value}`).join('\n')}
                          onChange={(e) =>
                            updateBlock(idx, {
                              ...blk,
                              data: e.target.value
                                .split('\n')
                                .map((line) => {
                                  const [lbl, val] = line.split(':');
                                  return {
                                    label: (lbl || '').trim(),
                                    value: Number((val || '0').trim()) || 0,
                                  };
                                })
                                .filter((d) => d.label),
                            })
                          }
                          placeholder="One series item per line, e.g. Q1: 42"
                          className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-2 text-[11px] font-mono"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT: Live PDF Preview + Saved PDF Library */}
          <div className="lg:col-span-6 space-y-5">
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Live PDF Preview
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {activePdf
                      ? `${activePdf.title}.pdf · ${activePdf.pageCount} page(s)`
                      : 'Click Build & Save PDF to compile your document preview'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewView('native')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      previewView === 'native'
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    PDF Viewer
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewView('sheet')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      previewView === 'sheet'
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    Sheet Outline
                  </button>
                </div>
              </div>

              {buildingPdf || synthesizing ? (
                <div className="py-16 flex justify-center">
                  <NovaMiniPlanetLoader size="md" label="Rendering PDF typography, charts & images..." />
                </div>
              ) : previewView === 'native' && previewBlobUrl ? (
                <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-100 dark:bg-black/40">
                  <iframe
                    title="Compiled PDF Preview"
                    src={previewBlobUrl}
                    className="w-full h-[540px]"
                  />
                </div>
              ) : (
                /* Responsive Sheet Outline (also accessible on mobile devices without PDF iframe plugin) */
                <div className="rounded-xl border border-slate-200 bg-white text-slate-900 p-6 shadow-inner max-h-[540px] overflow-y-auto space-y-5">
                  <div className="border-b border-slate-200 pb-3">
                    <div className="h-1 w-12 bg-violet-700 mb-3" />
                    <h4 className="text-xl font-bold">{docTitle}</h4>
                    {docSubtitle && <p className="text-xs text-slate-600 mt-1">{docSubtitle}</p>}
                    <p className="text-[11px] text-slate-500 mt-1">
                      {docAuthor} · {layoutConfig.pageSize.toUpperCase()} {layoutConfig.orientation} ·{' '}
                      {layoutConfig.fontFamily}
                    </p>
                  </div>

                  {blocks.map((blk) => (
                    <div key={blk.id} className="space-y-1.5">
                      {blk.kind === 'section' && (
                        <>
                          <h5 className="text-sm font-bold text-violet-800">{blk.heading}</h5>
                          {blk.paragraphs.map((p, idx) => (
                            <p key={idx} className="text-xs text-slate-700 leading-relaxed">
                              {p}
                            </p>
                          ))}
                          {blk.bullets.length > 0 && (
                            <ul className="list-disc list-inside text-xs text-slate-700 space-y-0.5">
                              {blk.bullets.map((b, i) => (
                                <li key={i}>{b}</li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}

                      {blk.kind === 'image' && (
                        <figure className="space-y-1">
                          <img
                            src={blk.dataUrl}
                            alt={blk.caption}
                            className="max-h-56 rounded-lg border border-slate-200 mx-auto object-contain"
                          />
                          <figcaption className="text-[10px] text-slate-500 text-center italic">
                            {[blk.caption, blk.attribution].filter(Boolean).join(' · ')}
                          </figcaption>
                        </figure>
                      )}

                      {blk.kind === 'table' && (
                        <div className="overflow-x-auto">
                          <div className="text-xs font-bold text-violet-800 mb-1">{blk.title}</div>
                          <table className="w-full text-[11px] border border-slate-200">
                            <thead className="bg-violet-700 text-white">
                              <tr>
                                {blk.headers.map((h, i) => (
                                  <th key={i} className="px-2 py-1 text-left">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {blk.rows.map((r, rI) => (
                                <tr key={rI} className="even:bg-slate-50 border-t border-slate-200">
                                  {blk.headers.map((_, cI) => (
                                    <td key={cI} className="px-2 py-1">
                                      {r[cI] ?? ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {blk.kind === 'chart' && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs font-bold text-violet-800 mb-2">
                            {blk.title} ({blk.chartType.toUpperCase()})
                          </div>
                          <div className="space-y-1">
                            {blk.data.map((d, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className="w-16 truncate text-slate-600">{d.label}</span>
                                <div className="flex-1 h-2.5 bg-slate-200 rounded">
                                  <div
                                    className="h-2.5 bg-violet-600 rounded"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.round(
                                          (d.value /
                                            Math.max(1, ...blk.data.map((x) => x.value))) *
                                            100
                                        )
                                      )}%`,
                                    }}
                                  />
                                </div>
                                <span className="w-10 text-right font-mono">{d.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Saved PDF Library */}
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Saved PDF Library ({savedPdfs.length})
                </h3>
                <div>
                  <input
                    ref={pdfUploadInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadSourceDocument(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => pdfUploadInputRef.current?.click()}
                    className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/15 px-3 text-xs font-medium hover:border-violet-400"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Open Device PDF</span>
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-white/8 max-h-56 overflow-y-auto">
                {savedPdfs.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    Click &ldquo;Build &amp; Save PDF&rdquo; above to save your compiled document to NOVA Library.
                  </p>
                ) : (
                  savedPdfs.map((pdf) => (
                    <div
                      key={pdf.id}
                      className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-1"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActivePdf(pdf);
                          setEditingPdf(pdf);
                          setEditTitle(pdf.title);
                          if (pdf.blocks && pdf.blocks.length > 0) {
                            setBlocks(pdf.blocks);
                            setDocTitle(pdf.title);
                            setDocSubtitle(pdf.subtitle);
                            if (pdf.layoutConfig) setLayoutConfig(pdf.layoutConfig);
                          }
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" />
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {pdf.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                          {pdf.pageCount} page(s) · Updated {pdf.updatedAt}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePdf(pdf);
                            setEditingPdf(pdf);
                            setEditTitle(pdf.title);
                          }}
                          aria-label={`Preview ${pdf.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-violet-400"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadBase64Pdf(pdf.base64Data, pdf.title)}
                          aria-label={`Download ${pdf.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-violet-600 dark:text-violet-300 hover:bg-violet-500/15"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDeletePdf(pdf.id);
                            if (activePdf?.id === pdf.id) setActivePdf(null);
                            if (editingPdf?.id === pdf.id) setEditingPdf(null);
                          }}
                          aria-label={`Delete ${pdf.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : (
        /* MODIFY & STAMP EXISTING PDF MODE */
        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Modify, Watermark &amp; Stamp Existing PDF
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editingPdf
                  ? `Editing "${editingPdf.title}" (${editingPdf.pageCount} pages) locally via pdf-lib`
                  : 'Select a PDF from your library or upload one from your device'}
              </p>
            </div>
            {editingPdf && (
              <button
                type="button"
                onClick={() => downloadBase64Pdf(editingPdf.base64Data, editingPdf.title)}
                className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Modified PDF</span>
              </button>
            )}
          </div>

          {editingPdf ? (
            <form onSubmit={(e) => void handleApplyPdfEdits(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    PDF Title Metadata
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Diagonal Watermark (optional)
                  </label>
                  <input
                    type="text"
                    value={editWatermark}
                    onChange={(e) => setEditWatermark(e.target.value)}
                    placeholder="e.g. CONFIDENTIAL or DRAFT"
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Annotate Page #
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, editingPdf.pageCount)}
                    value={editNotePage}
                    onChange={(e) => setEditNotePage(Number(e.target.value) || 1)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-sm tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Stamp / Note Banner on Page
                  </label>
                  <input
                    type="text"
                    value={editNoteText}
                    onChange={(e) => setEditNoteText(e.target.value)}
                    placeholder="e.g. Approved for Final Distribution"
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-4 space-y-2.5">
                <div className="text-xs font-semibold">Append Extra Page</div>
                <input
                  type="text"
                  value={editAppendHeading}
                  onChange={(e) => setEditAppendHeading(e.target.value)}
                  placeholder="New Page Heading..."
                  className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-3 text-xs"
                />
                <textarea
                  rows={3}
                  value={editAppendBody}
                  onChange={(e) => setEditAppendBody(e.target.value)}
                  placeholder="Body text to append as an extra PDF page..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-3 text-xs"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Delete Page Numbers (comma-separated, e.g. 2,4)
                  </label>
                  <input
                    type="text"
                    value={editDeletePages}
                    onChange={(e) => setEditDeletePages(e.target.value)}
                    placeholder="Leave empty to keep all pages"
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pdfModifying}
                  className="min-h-[44px] rounded-xl bg-violet-600 px-5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {pdfModifying ? 'Modifying...' : 'Apply Changes to PDF'}
                </button>
              </div>
            </form>
          ) : (
            <p className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Select a PDF from the PDF Composer library or open one from your device first.
            </p>
          )}
        </section>
      )}
    </div>
  );
};
