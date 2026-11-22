import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileEdit,
  Image as ImageIcon,
  LayoutTemplate,
  Music,
  ScanEye,
  Film,
  Upload,
} from 'lucide-react';
import type {
  GeneratedImageRecord,
  GeneratedPdfRecord,
  IntelligenceMode,
  NovaProject,
  PreferredModelId,
  PublicMediaResult,
  ReviewReport,
  StudioArtifact,
} from '../types/nova';
import {
  createFormattedPdf,
  downloadBase64Pdf,
  uint8ToBase64,
} from '../utils/pdfEngine';
import { DeveloperStudioView } from './DeveloperStudioView';
import { StudioArtifactsWorkspace } from './ecosystem/StudioArtifactsWorkspace';
import { NovaMiniPlanetLoader } from './NovaCoreOrb';
import { ImageStudioModule, type StagedPdfImagePayload } from './studio/ImageStudioModule';
import { PdfStudioModule } from './studio/PdfStudioModule';

export type StudioSubTab = 'artifacts' | 'pictures' | 'pdfs' | 'review' | 'developer' | 'media';

interface StudioPanelProps {
  reasoningMode: IntelligenceMode;
  preferredModel: PreferredModelId;
  isOffline: boolean;
  savedImages: GeneratedImageRecord[];
  savedPdfs: GeneratedPdfRecord[];
  artifacts?: StudioArtifact[];
  activeProject?: NovaProject | null;
  initialSubTab?: StudioSubTab;
  onOpenApiSettings?: () => void;
  onSaveArtifact?: (artifact: StudioArtifact) => void;
  onDeleteArtifact?: (id: string) => void;
  onSaveImage: (img: GeneratedImageRecord) => void;
  onDeleteImage: (id: string) => void;
  onSavePdf: (pdf: GeneratedPdfRecord) => void;
  onDeletePdf: (id: string) => void;
  onIndexCreatedItem: (item: {
    title: string;
    subtitle: string;
    type: 'pdf' | 'image';
    sizeOrMeta: string;
    contentPreview?: string;
  }) => void;
}

export const StudioPanel: React.FC<StudioPanelProps> = ({
  reasoningMode,
  preferredModel,
  isOffline,
  savedImages,
  savedPdfs,
  artifacts = [],
  activeProject = null,
  initialSubTab = 'artifacts',
  onOpenApiSettings,
  onSaveArtifact = () => {},
  onDeleteArtifact = () => {},
  onSaveImage,
  onDeleteImage,
  onSavePdf,
  onDeletePdf,
  onIndexCreatedItem,
}) => {
  const [subTab, setSubTab] = useState<StudioSubTab>(initialSubTab);
  const [stagedPdfMedia, setStagedPdfMedia] = useState<StagedPdfImagePayload | null>(null);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Reviewer State
  const [reviewText, setReviewText] = useState('');
  const [reviewFocus, setReviewFocus] = useState('clarity, accuracy, structure, and completeness');
  const [reviewFile, setReviewFile] = useState<{
    name: string;
    mimeType: string;
    dataBase64: string;
  } | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewReport, setReviewReport] = useState<ReviewReport | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);
  const reviewUploadRef = useRef<HTMLInputElement>(null);

  // Music & Movies State
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicResult, setMusicResult] = useState<{
    audioDataUrl: string;
    lyrics: string;
    prompt: string;
  } | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);

  const [mediaQuery, setMediaQuery] = useState('');
  const [mediaType, setMediaType] = useState<'movies' | 'audio'>('movies');
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaResults, setMediaResults] = useState<PublicMediaResult[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const offlineBlocked = isOffline || reasoningMode === 'offline';

  const handleUploadForReview = async (file: File) => {
    if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
      const buf = await file.arrayBuffer();
      const base64 = uint8ToBase64(new Uint8Array(buf));
      setReviewFile({ name: file.name, mimeType: file.type, dataBase64: base64 });
    } else {
      const txt = await file.text();
      setReviewText(txt);
      setReviewFile({ name: file.name, mimeType: 'text/plain', dataBase64: '' });
    }
  };

  const handleRunReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim() && !reviewFile?.dataBase64) return;
    if (offlineBlocked) {
      // Genuine offline heuristic document review
      const words = reviewText.trim().split(/\s+/).filter(Boolean).length;
      const sentences = reviewText.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
      setReviewReport({
        overallAssessment: `Offline Edge Review: Analyzed ${words} words across ${sentences} sentences locally with zero cloud transfer.`,
        readinessScore: Math.min(95, Math.max(55, 65 + Math.round(words / 25))),
        strengths: [
          'Processed 100% privately on your device.',
          words > 40 ? 'Substantive length for clear reader context.' : 'Concise draft structure.',
        ],
        issues:
          words < 25
            ? [
                {
                  severity: 'medium',
                  location: 'Document Length',
                  detail: 'Draft is very brief and may benefit from supporting examples.',
                  suggestion: 'Add 2-3 bullet takeaways or an explicit conclusion.',
                },
              ]
            : [],
        improvedDraft: reviewText.trim(),
      });
      return;
    }

    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await fetch('/api/nova/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentText: reviewText,
          attachmentBase64: reviewFile?.dataBase64 || undefined,
          attachmentMimeType: reviewFile?.mimeType || undefined,
          fileName: reviewFile?.name || 'Draft',
          reviewFocus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed');
      setReviewReport(data);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Unable to complete review');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleGenerateMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicPrompt.trim()) return;
    if (offlineBlocked) {
      setMusicError('AI music generation requires network access.');
      return;
    }
    setMusicLoading(true);
    setMusicError(null);
    try {
      const res = await fetch('/api/nova/generate-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: musicPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Music generation failed');
      setMusicResult({
        audioDataUrl: data.audioDataUrl,
        lyrics: data.lyrics || '',
        prompt: musicPrompt.trim(),
      });
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : 'Unable to generate music');
    } finally {
      setMusicLoading(false);
    }
  };

  const handleSearchMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaQuery.trim()) return;
    setMediaLoading(true);
    setMediaError(null);
    try {
      const res = await fetch('/api/nova/media-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mediaQuery.trim(), mediaType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Media lookup failed');
      setMediaResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'Unable to search public media archive');
    } finally {
      setMediaLoading(false);
    }
  };

  const subTabs: Array<{ id: StudioSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'artifacts', label: 'AI Artifacts', icon: <LayoutTemplate className="h-4 w-4" /> },
    { id: 'pictures', label: 'AI Pictures', icon: <ImageIcon className="h-4 w-4" /> },
    { id: 'pdfs', label: 'PDF Studio & Editor', icon: <FileEdit className="h-4 w-4" /> },
    { id: 'review', label: 'Deep Reviewer', icon: <ScanEye className="h-4 w-4" /> },
    { id: 'developer', label: 'Developer AI', icon: <Code2 className="h-4 w-4" /> },
    { id: 'media', label: 'Music & Movies', icon: <Film className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Studio Sub-Navigation */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-2">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === t.id
                ? 'bg-violet-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {subTab === 'artifacts' && (
        <StudioArtifactsWorkspace
          artifacts={artifacts}
          activeProject={activeProject}
          isOffline={offlineBlocked}
          onSaveArtifact={onSaveArtifact}
          onDeleteArtifact={onDeleteArtifact}
        />
      )}

      {subTab === 'developer' && (
        <DeveloperStudioView isOffline={offlineBlocked} preferredModel={preferredModel} />
      )}

      {subTab === 'pictures' && (
        <ImageStudioModule
          isOffline={offlineBlocked}
          savedImages={savedImages}
          onSaveImage={onSaveImage}
          onDeleteImage={onDeleteImage}
          onOpenApiSettings={onOpenApiSettings}
          onSendImageToPdf={(payload) => {
            setStagedPdfMedia(payload);
            setSubTab('pdfs');
          }}
          onIndexCreatedItem={onIndexCreatedItem}
        />
      )}

      {subTab === 'pdfs' && (
        <PdfStudioModule
          isOffline={offlineBlocked}
          savedImages={savedImages}
          savedPdfs={savedPdfs}
          stagedMedia={stagedPdfMedia}
          onClearStagedMedia={() => setStagedPdfMedia(null)}
          onSavePdf={onSavePdf}
          onDeletePdf={onDeletePdf}
          onIndexCreatedItem={onIndexCreatedItem}
          onOpenImageStudio={() => setSubTab('pictures')}
        />
      )}

      {/* 3. EXPERT DOCUMENT, PDF & CODE REVIEWER */}
      {subTab === 'review' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Deep Document &amp; Code Reviewer</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Upload a PDF, image, or code file, or paste text for critical line-by-line review
                </p>
              </div>
              <div>
                <input
                  ref={reviewUploadRef}
                  type="file"
                  accept=".pdf,.txt,.md,.json,.ts,.tsx,.js,.py,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadForReview(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => reviewUploadRef.current?.click()}
                  className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-violet-400/25 px-3 text-xs font-medium text-violet-200 hover:bg-violet-500/15 shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload</span>
                </button>
              </div>
            </div>

            {reviewFile && (
              <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-[#181228] px-3 py-2 text-xs text-violet-200">
                <span className="truncate">Loaded: {reviewFile.name}</span>
                <button
                  type="button"
                  onClick={() => setReviewFile(null)}
                  className="text-rose-300 hover:text-rose-200 ml-2"
                >
                  Clear
                </button>
              </div>
            )}

            <form onSubmit={handleRunReview} className="space-y-3">
              <select
                value={reviewFocus}
                onChange={(e) => setReviewFocus(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-700 dark:text-slate-200 focus:border-violet-400 focus:outline-none"
              >
                <option value="clarity, accuracy, structure, and completeness">
                  Focus: General Quality &amp; Clarity
                </option>
                <option value="bugs, security vulnerabilities, edge cases, and performance">
                  Focus: Code &amp; Security Review
                </option>
                <option value="legal risks, missing clauses, and ambiguity">
                  Focus: Contract &amp; Policy Review
                </option>
                <option value="grammar, tone, persuasion, and conciseness">
                  Focus: Writing &amp; Grammar Polish
                </option>
              </select>

              <textarea
                rows={7}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Paste essay, contract, resume, code, or additional review instructions..."
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
              />

              {reviewError && (
                <div className="rounded-xl border border-rose-400/25 bg-rose-950/35 p-3 text-xs text-rose-200">
                  {reviewError}
                </div>
              )}

              <button
                type="submit"
                disabled={reviewLoading || (!reviewText.trim() && !reviewFile?.dataBase64)}
                className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
              >
                <ScanEye className="h-4 w-4" />
                <span>{reviewLoading ? 'Reviewing...' : 'Run Expert Review'}</span>
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Review Findings</h3>
              {reviewReport && (
                <span className="text-xs font-semibold text-violet-300 tabular-nums">
                  Readiness Score: {reviewReport.readinessScore}/100
                </span>
              )}
            </div>

            {reviewLoading ? (
              <div className="py-12 flex justify-center">
                <NovaMiniPlanetLoader size="md" label="Nova is analyzing your document..." />
              </div>
            ) : !reviewReport ? (
              <p className="py-12 text-center text-xs text-slate-600 dark:text-slate-400">
                Upload a PDF or paste content on the left to receive structured feedback and an
                improved draft.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  {reviewReport.overallAssessment}
                </p>

                {reviewReport.strengths.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-emerald-300 mb-1.5">Strengths</h4>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
                      {reviewReport.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {reviewReport.issues.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-amber-300">Actionable Issues</h4>
                    {reviewReport.issues.map((iss, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] p-3 text-xs space-y-1"
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {iss.location} ·{' '}
                          <span className="capitalize text-amber-300">{iss.severity}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{iss.detail}</p>
                        <p className="text-violet-200">Fix: {iss.suggestion}</p>
                      </div>
                    ))}
                  </div>
                )}

                {reviewReport.improvedDraft && (
                  <div className="border-t border-slate-200 dark:border-white/8 pt-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Polished Draft</h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(reviewReport.improvedDraft);
                            setCopiedDraft(true);
                            setTimeout(() => setCopiedDraft(false), 1600);
                          }}
                          className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-violet-400/25 px-2.5 text-xs text-violet-200 hover:bg-violet-500/15"
                        >
                          {copiedDraft ? (
                            <Check className="h-3.5 w-3.5 text-emerald-300" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedDraft ? 'Copied' : 'Copy Draft'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const pdf = createFormattedPdf({
                              title: reviewFile?.name
                                ? `Reviewed_${reviewFile.name.replace(/\.[^.]+$/, '')}`
                                : 'Nova_Reviewed_Document',
                              subtitle: 'Polished via Nova Deep Reviewer',
                              sections: [
                                {
                                  heading: 'Reviewed & Improved Content',
                                  paragraphs: reviewReport.improvedDraft.split('\n\n'),
                                },
                              ],
                            });
                            onSavePdf(pdf);
                            downloadBase64Pdf(pdf.base64Data, pdf.title);
                          }}
                          className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Save as PDF</span>
                        </button>
                      </div>
                    </div>
                    <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 dark:bg-[#181228] p-3 text-xs text-slate-700 dark:text-slate-200 font-sans">
                      {reviewReport.improvedDraft}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 4. AI MUSIC + OPEN-LICENSED MOVIES & MUSIC DOWNLOADS */}
      {subTab === 'media' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* AI Music Generator */}
          <section className="lg:col-span-5 rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">AI Music Generator</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Compose custom 30-second tracks with Gemini Lyria and download MP3s
              </p>
            </div>

            <form onSubmit={handleGenerateMusic} className="space-y-3">
              <textarea
                rows={3}
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                placeholder="e.g. 'Midnight synthwave lo-fi beat with soft purple ambient pads'"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
              />
              {musicError && (
                <div className="rounded-xl border border-rose-400/25 bg-rose-950/35 p-3 text-xs text-rose-200">
                  {musicError}
                </div>
              )}
              <button
                type="submit"
                disabled={musicLoading || !musicPrompt.trim()}
                className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
              >
                <Music className="h-4 w-4" />
                <span>{musicLoading ? 'Composing Track...' : 'Generate AI Track'}</span>
              </button>
            </form>

            {musicResult && (
              <div className="rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] p-4 space-y-3">
                <div className="text-xs font-medium text-slate-900 dark:text-white">{musicResult.prompt}</div>
                <audio controls src={musicResult.audioDataUrl} className="w-full" />
                <a
                  href={musicResult.audioDataUrl}
                  download={`nova-track-${Date.now()}.mp3`}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download MP3</span>
                </a>
                {musicResult.lyrics && (
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{musicResult.lyrics}</p>
                )}
              </div>
            )}
          </section>

          {/* Public Domain Movies & Music Archive */}
          <section className="lg:col-span-7 rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Public-Domain Movies &amp; Music Downloads
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Stream and download verified open-licensed films &amp; audio directly from Internet
                Archive
              </p>
            </div>

            <form onSubmit={handleSearchMedia} className="flex flex-col sm:flex-row gap-2">
              <input
                type="search"
                value={mediaQuery}
                onChange={(e) => setMediaQuery(e.target.value)}
                placeholder="Search classic films, documentaries, jazz, lo-fi, or soundtracks..."
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
              />
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as 'movies' | 'audio')}
                className="min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-700 dark:text-slate-200 focus:border-violet-400 focus:outline-none"
              >
                <option value="movies">Movies &amp; Video</option>
                <option value="audio">Music &amp; Audio</option>
              </select>
              <button
                type="submit"
                disabled={mediaLoading || !mediaQuery.trim()}
                className="min-h-[44px] rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 whitespace-nowrap"
              >
                {mediaLoading ? 'Searching...' : 'Find Media'}
              </button>
            </form>

            {mediaError && (
              <div className="rounded-xl border border-rose-400/25 bg-rose-950/35 p-3 text-xs text-rose-200">
                {mediaError}
              </div>
            )}

            <div className="divide-y divide-white/8">
              {mediaResults.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-600 dark:text-slate-400">
                  Search public-domain cinema (e.g. &ldquo;Night of the Living Dead&rdquo;,
                  &ldquo;Charlie Chaplin&rdquo;) or free music (e.g. &ldquo;classical piano&rdquo;,
                  &ldquo;ambient&rdquo;).
                </p>
              ) : (
                mediaResults.map((item) => (
                  <div key={item.id} className="py-4 first:pt-1 last:pb-1 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          {item.creator}
                          {item.year ? ` · ${item.year}` : ''} · {item.fileName}
                        </div>
                      </div>
                      <a
                        href={item.downloadUrl}
                        download={item.fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500 shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download</span>
                      </a>
                    </div>
                    {item.mediaType === 'movies' ? (
                      <video
                        controls
                        preload="none"
                        src={item.streamUrl}
                        className="w-full max-h-52 rounded-xl bg-black"
                      />
                    ) : (
                      <audio controls preload="none" src={item.streamUrl} className="w-full" />
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
