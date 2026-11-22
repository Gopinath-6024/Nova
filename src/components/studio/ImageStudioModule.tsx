import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Download,
  ExternalLink,
  FilePlus2,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import type {
  ArtworkStylePreset,
  GeneratedImageRecord,
  ImageSearchProviderId,
  RealPhotoSearchResult,
  StudioProviderStatus,
} from '../../types/nova';
import { NovaMiniPlanetLoader } from '../NovaCoreOrb';

export interface StagedPdfImagePayload {
  id: string;
  dataUrl: string;
  caption: string;
  sourceKind: 'ai_generated' | 'real_photo' | 'uploaded';
  attribution?: string;
}

interface ImageStudioModuleProps {
  isOffline: boolean;
  savedImages: GeneratedImageRecord[];
  onSaveImage: (img: GeneratedImageRecord) => void;
  onDeleteImage: (id: string) => void;
  onSendImageToPdf?: (payload: StagedPdfImagePayload) => void;
  onOpenApiSettings?: () => void;
  onIndexCreatedItem: (item: {
    title: string;
    subtitle: string;
    type: 'pdf' | 'image';
    sizeOrMeta: string;
    contentPreview?: string;
  }) => void;
}

type AspectRatioValue = '1:1' | '16:9' | '9:16' | '3:2' | '2:3' | '4:3' | '3:4' | '4:1' | '1:4';

const ASPECT_OPTIONS: Array<{ value: AspectRatioValue; label: string }> = [
  { value: '1:1', label: '1:1 Square' },
  { value: '16:9', label: '16:9 Widescreen' },
  { value: '9:16', label: '9:16 Vertical / Story' },
  { value: '3:2', label: '3:2 DSLR Photo' },
  { value: '2:3', label: '2:3 Poster Portrait' },
  { value: '4:3', label: '4:3 Editorial' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '4:1', label: '4:1 Wide Banner' },
  { value: '1:4', label: '1:4 Tall Pillar' },
];

const STYLE_PRESET_OPTIONS: Array<{ value: ArtworkStylePreset; label: string }> = [
  { value: 'auto', label: 'Auto (Balanced Premium)' },
  { value: 'photorealistic', label: 'Photorealistic' },
  { value: 'cinematic', label: 'Cinematic Artwork' },
  { value: 'anime', label: 'Anime-inspired Illustration' },
  { value: 'wallpaper', label: 'Professional Wallpaper' },
  { value: 'fantasy', label: 'Fantasy Environment' },
  { value: 'architecture', label: 'Architecture & Landscapes' },
  { value: 'product', label: 'Product Photography' },
  { value: '3d_artwork', label: '3D Artwork' },
  { value: 'character', label: 'Detailed Character Illustration' },
  { value: 'educational', label: 'Educational Illustration' },
];

function formatByteLabel(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export const ImageStudioModule: React.FC<ImageStudioModuleProps> = ({
  isOffline,
  savedImages,
  onSaveImage,
  onDeleteImage,
  onSendImageToPdf,
  onOpenApiSettings,
  onIndexCreatedItem,
}) => {
  const [studioTab, setStudioTab] = useState<'generate' | 'photos'>('generate');
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'ai' | 'real'>('all');

  // Provider Config & Quotas
  const [providerStatus, setProviderStatus] = useState<StudioProviderStatus | null>(null);

  // AI Image Generation State
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioValue>('1:1');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('2K');
  const [engineQuality, setEngineQuality] = useState<'standard' | 'pro'>('pro');
  const [stylePreset, setStylePreset] = useState<ArtworkStylePreset>('auto');
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [enhancingPreview, setEnhancingPreview] = useState(false);
  const [sourceRefUrl, setSourceRefUrl] = useState<string | null>(null);
  const [sourceRefMime, setSourceRefMime] = useState<string>('image/png');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<{ message: string; paidKeyRequired?: boolean } | null>(null);
  const [lastGenerated, setLastGenerated] = useState<GeneratedImageRecord | null>(null);

  // Real Photograph Search State
  const [photoQuery, setPhotoQuery] = useState('');
  const [photoProvider, setPhotoProvider] = useState<ImageSearchProviderId>('auto');
  const [photoResults, setPhotoResults] = useState<RealPhotoSearchResult[]>([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoProviderUsed, setPhotoProviderUsed] = useState<string | null>(null);
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<{
    dataUrl: string;
    title: string;
    sourceKind: 'ai_generated' | 'real_photo' | 'uploaded';
    metaLine: string;
    attribution?: string;
    promptForRegen?: string;
    aspectRatio?: string;
    imageSize?: '1K' | '2K' | '4K';
    externalUrl?: string;
  } | null>(null);

  const refUploadInput = useRef<HTMLInputElement>(null);
  const galleryUploadInput = useRef<HTMLInputElement>(null);

  const fetchProviderStatus = async () => {
    try {
      const res = await fetch('/api/nova/media-studio/config');
      if (res.ok) {
        const data = (await res.json()) as StudioProviderStatus;
        setProviderStatus(data);
      }
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    void fetchProviderStatus();
  }, []);

  const effectiveProModel =
    engineQuality === 'pro' ||
    imageSize === '2K' ||
    imageSize === '4K' ||
    aspectRatio === '3:2' ||
    aspectRatio === '2:3' ||
    aspectRatio === '4:1' ||
    aspectRatio === '1:4';

  const handlePreviewEnhancedPrompt = async () => {
    if (!prompt.trim() || enhancingPreview || isOffline) return;
    setEnhancingPreview(true);
    try {
      const res = await fetch('/api/nova/media-studio/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), stylePreset }),
      });
      const data = await res.json();
      if (res.ok && data.enhancedPrompt) {
        setPrompt(String(data.enhancedPrompt));
      }
    } catch {
      // keep existing prompt if enhance preview fails
    } finally {
      setEnhancingPreview(false);
    }
  };

  const runGenerateImage = async (
    targetPrompt: string,
    targetAspect = aspectRatio,
    targetSize = imageSize,
    targetQuality = engineQuality,
    targetStyle = stylePreset
  ) => {
    if (!targetPrompt.trim()) return;
    if (isOffline) {
      setGenError({
        message:
          'You are currently offline. AI image generation requires a live network connection. Uploaded photos in your gallery remain usable in PDF Studio.',
      });
      return;
    }

    setGenLoading(true);
    setGenError(null);
    try {
      const res = await fetch('/api/nova/media-studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: targetPrompt.trim(),
          aspectRatio: targetAspect,
          imageSize: targetSize,
          quality: targetQuality,
          stylePreset: targetStyle,
          enhancePrompt,
          ...(sourceRefUrl
            ? { sourceImageBase64: sourceRefUrl, sourceMimeType: sourceRefMime }
            : {}),
        }),
      });
      const data = await res.json();
      if (data.usage) {
        setProviderStatus((prev) => (prev ? { ...prev, usage: data.usage } : prev));
      } else {
        void fetchProviderStatus();
      }

      if (!res.ok || !data.imageDataUrl) {
        setGenError({
          message: data.error || `Image generation failed (HTTP ${res.status}).`,
          paidKeyRequired: Boolean(data.paidKeyRequired),
        });
        return;
      }

      const record: GeneratedImageRecord = {
        id: `img-${Date.now()}`,
        prompt: targetPrompt.trim(),
        enhancedPrompt: data.enhancedPromptUsed || targetPrompt.trim(),
        stylePreset: targetStyle,
        aspectRatio: data.aspectRatio || targetAspect,
        imageSize: (data.imageSize || targetSize) as '1K' | '2K' | '4K',
        width: typeof data.width === 'number' ? data.width : undefined,
        height: typeof data.height === 'number' ? data.height : undefined,
        byteLength: typeof data.byteLength === 'number' ? data.byteLength : undefined,
        mimeType: data.mimeType || 'image/png',
        modelUsed: data.modelUsed || 'gemini-nano-banana-2.1',
        sourceKind: 'ai_generated',
        provider: 'Gemini Image',
        dataUrl: data.imageDataUrl,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      onSaveImage(record);
      setLastGenerated(record);
      const resLabel =
        record.width && record.height
          ? `${record.width}×${record.height}`
          : `${record.aspectRatio} ${record.imageSize}`;
      onIndexCreatedItem({
        title: `AI_Image_${record.id.slice(-4)}.png`,
        subtitle: `AI Generated · ${resLabel} · ${record.modelUsed}`,
        type: 'image',
        sizeOrMeta: resLabel,
        contentPreview: record.prompt,
      });
    } catch (err) {
      setGenError({
        message: err instanceof Error ? err.message : 'Unable to reach Gemini Image endpoint.',
      });
    } finally {
      setGenLoading(false);
    }
  };

  const handleSearchRealPhotos = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!photoQuery.trim()) return;
    if (isOffline) {
      setPhotoError('Real photograph search requires an active internet connection.');
      return;
    }
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const res = await fetch('/api/nova/media-studio/search-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: photoQuery.trim(),
          provider: photoProvider,
          perPage: 12,
        }),
      });
      const data = await res.json();
      if (data.usage) {
        setProviderStatus((prev) => (prev ? { ...prev, usage: data.usage } : prev));
      }
      if (!res.ok) {
        throw new Error(data.error || 'Real photograph search failed.');
      }
      setPhotoResults(Array.isArray(data.results) ? data.results : []);
      setPhotoProviderUsed(data.providerUsed || photoProvider);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Unable to search real photographs.');
    } finally {
      setPhotoLoading(false);
    }
  };

  const fetchProxiedDataUrl = async (url: string): Promise<string> => {
    const res = await fetch('/api/nova/media-studio/proxy-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok || !data.dataUrl) {
      throw new Error(data.error || 'Failed to retrieve verified photograph bytes.');
    }
    return data.dataUrl as string;
  };

  const handleSaveRealPhotoToGallery = async (
    photo: RealPhotoSearchResult,
    alsoSendToPdf = false
  ) => {
    setBusyPhotoId(photo.id);
    setPhotoError(null);
    try {
      const dataUrl = await fetchProxiedDataUrl(photo.fullUrl);
      const record: GeneratedImageRecord = {
        id: `photo-${Date.now()}`,
        prompt: photo.title,
        aspectRatio: `${photo.width}×${photo.height}`,
        sourceKind: 'real_photo',
        attribution: photo.attributionText,
        license: photo.license,
        provider: photo.provider,
        sourceUrl: photo.fullUrl,
        dataUrl,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      onSaveImage(record);
      onIndexCreatedItem({
        title: `Photo_${photo.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 26)}.jpg`,
        subtitle: `Real Photograph · ${photo.provider} · ${photo.photographer}`,
        type: 'image',
        sizeOrMeta: photo.provider,
        contentPreview: photo.attributionText,
      });
      if (alsoSendToPdf && onSendImageToPdf) {
        onSendImageToPdf({
          id: record.id,
          dataUrl,
          caption: photo.title,
          sourceKind: 'real_photo',
          attribution: photo.attributionText,
        });
      }
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Could not import this photograph into NOVA gallery.'
      );
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleUploadDevicePhoto = (file: File, target: 'ref' | 'gallery') => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const url = String(reader.result || '');
      if (!url) return;
      if (target === 'ref') {
        setSourceRefUrl(url);
        setSourceRefMime(file.type || 'image/png');
      } else {
        const record: GeneratedImageRecord = {
          id: `upload-${Date.now()}`,
          prompt: file.name.replace(/\.[^.]+$/, ''),
          aspectRatio: 'Uploaded',
          sourceKind: 'uploaded',
          provider: 'Local Device',
          dataUrl: url,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        onSaveImage(record);
        onIndexCreatedItem({
          title: file.name,
          subtitle: 'Uploaded Photograph · Local Device',
          type: 'image',
          sizeOrMeta: 'Uploaded',
          contentPreview: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const filteredGallery = savedImages.filter((item) => {
    if (galleryFilter === 'all') return true;
    const kind = item.sourceKind || 'ai_generated';
    if (galleryFilter === 'ai') return kind === 'ai_generated';
    return kind === 'real_photo' || kind === 'uploaded';
  });

  const aiQuotaText = providerStatus
    ? `${providerStatus.usage.imagesGeneratedToday}/${providerStatus.usage.dailyImageLimit} AI today`
    : 'Quota Ready';
  const searchQuotaText = providerStatus
    ? `${providerStatus.usage.photoSearchesToday}/${providerStatus.usage.dailyPhotoSearchLimit} searches`
    : '';

  return (
    <div className="space-y-6">
      {/* Studio Top Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
            NOVA Image Studio
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
            AI generation (Gemini Image) &amp; real licensed photograph discovery ·{' '}
            <span className="font-medium text-violet-700 dark:text-violet-300">{aiQuotaText}</span>
            {searchQuotaText ? ` · ${searchQuotaText}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#181228] p-1">
            <button
              type="button"
              onClick={() => setStudioTab('generate')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                studioTab === 'generate'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Image Studio</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('photos')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                studioTab === 'photos'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Real Photos</span>
            </button>
          </div>

          {onOpenApiSettings && (
            <button
              type="button"
              onClick={onOpenApiSettings}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-violet-400"
            >
              <Settings className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
              <span>API Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT WORKBENCH: Generation OR Real Photo Search */}
        <div className="lg:col-span-6 space-y-5">
          {studioTab === 'generate' ? (
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    AI Image Generator
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Creates original AI artwork, illustrations, posters &amp; scenes via Gemini Image
                  </p>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-1 rounded-md ${
                    providerStatus?.geminiConfigured
                      ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {providerStatus?.geminiConfigured ? 'Gemini Ready' : 'Key Unconfigured'}
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runGenerateImage(prompt);
                }}
                className="space-y-3.5"
              >
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Image Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe subject, lighting, framing, style, and mood (e.g. 'Minimalist architectural studio with warm daylight and walnut shelving, crisp editorial photography')..."
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Visual Style
                    </label>
                    <select
                      value={stylePreset}
                      onChange={(e) => setStylePreset(e.target.value as ArtworkStylePreset)}
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-800 dark:text-slate-100 focus:border-violet-400 focus:outline-none"
                    >
                      {STYLE_PRESET_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Aspect Ratio
                    </label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as AspectRatioValue)}
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-800 dark:text-slate-100 focus:border-violet-400 focus:outline-none"
                    >
                      {ASPECT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Output Resolution
                    </label>
                    <select
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as '1K' | '2K' | '4K')}
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-800 dark:text-slate-100 focus:border-violet-400 focus:outline-none"
                    >
                      <option value="2K">2K High-Res (~2048px)</option>
                      <option value="4K">4K Ultra Print (~4096px)</option>
                      <option value="1K">1K Standard (~1024px)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Model Tier
                    </label>
                    <select
                      value={engineQuality}
                      onChange={(e) => setEngineQuality(e.target.value as 'standard' | 'pro')}
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-800 dark:text-slate-100 focus:border-violet-400 focus:outline-none"
                    >
                      <option value="pro">Nano Banana 2.1 (2K/4K Pro)</option>
                      <option value="standard">Flash Lite Image (Fast)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <div>
                    Routing engine:{' '}
                    <span className="font-mono text-slate-700 dark:text-slate-200">
                      {effectiveProModel ? 'gemini-nano-banana-2.1' : 'gemini-3.1-flash-lite-image'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={enhancePrompt}
                        onChange={(e) => setEnhancePrompt(e.target.checked)}
                        className="rounded border-slate-300 dark:border-white/20 text-violet-600 focus:ring-violet-500"
                      />
                      <span>Auto-enhance details</span>
                    </label>
                    <button
                      type="button"
                      disabled={enhancingPreview || !prompt.trim() || isOffline}
                      onClick={() => void handlePreviewEnhancedPrompt()}
                      className="font-medium text-violet-700 dark:text-violet-300 hover:underline disabled:opacity-45"
                    >
                      {enhancingPreview ? 'Enhancing...' : 'Preview Enhanced'}
                    </button>
                  </div>
                </div>

                {/* Optional Source Reference Photo */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3">
                  <input
                    ref={refUploadInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadDevicePhoto(f, 'ref');
                      e.target.value = '';
                    }}
                  />
                  <div className="flex items-center gap-2.5 min-w-0">
                    {sourceRefUrl && (
                      <img
                        src={sourceRefUrl}
                        alt="Reference"
                        className="h-9 w-9 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    )}
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                      {sourceRefUrl
                        ? 'Reference image attached for AI editing'
                        : 'Optional: attach reference photo to edit'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sourceRefUrl && (
                      <button
                        type="button"
                        onClick={() => setSourceRefUrl(null)}
                        className="min-h-[36px] px-2 text-xs text-rose-600 dark:text-rose-300 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => refUploadInput.current?.click()}
                      className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-violet-400/30 px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/15"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Attach</span>
                    </button>
                  </div>
                </div>

                {genError && (
                  <div className="rounded-xl border border-amber-400/35 bg-amber-50 dark:bg-amber-950/35 p-3.5 text-xs text-amber-900 dark:text-amber-100 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{genError.message}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      <button
                        type="button"
                        onClick={() => void runGenerateImage(prompt)}
                        className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Retry</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudioTab('photos')}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
                      >
                        Search Real Photographs (Free)
                      </button>
                      {onOpenApiSettings && (
                        <button
                          type="button"
                          onClick={onOpenApiSettings}
                          className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-[11px] font-medium hover:bg-amber-500/10"
                        >
                          Check API Status
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={genLoading || !prompt.trim()}
                  className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
                >
                  <Wand2 className={`h-4 w-4 ${genLoading ? 'animate-spin' : ''}`} />
                  <span>{genLoading ? 'Generating AI Image...' : 'Generate AI Image'}</span>
                </button>
              </form>

              {/* Latest Generated Spotlight */}
              {genLoading && (
                <div className="rounded-xl border border-violet-400/20 bg-slate-50 dark:bg-[#181228] p-4">
                  <NovaMiniPlanetLoader size="md" label="Rendering real pixels from Gemini Image..." />
                </div>
              )}

              {lastGenerated && !genLoading && (
                <div className="rounded-2xl border border-violet-500/25 bg-slate-50 dark:bg-[#181228] overflow-hidden">
                  <div className="relative group">
                    <img
                      src={lastGenerated.dataUrl}
                      alt={lastGenerated.prompt}
                      className="w-full max-h-80 object-contain bg-black/10 dark:bg-black/40 cursor-pointer"
                      onClick={() =>
                        setPreviewItem({
                          dataUrl: lastGenerated.dataUrl,
                          title: lastGenerated.prompt,
                          sourceKind: 'ai_generated',
                          metaLine: `AI Generated · ${
                            lastGenerated.width && lastGenerated.height
                              ? `${lastGenerated.width}×${lastGenerated.height} px · `
                              : ''
                          }${lastGenerated.aspectRatio}${
                            lastGenerated.mimeType ? ` · ${lastGenerated.mimeType}` : ''
                          }${
                            lastGenerated.byteLength
                              ? ` · ${formatByteLabel(lastGenerated.byteLength)}`
                              : ''
                          }`,
                          promptForRegen: lastGenerated.prompt,
                          aspectRatio: lastGenerated.aspectRatio,
                          imageSize: lastGenerated.imageSize,
                        })
                      }
                    />
                    <span className="absolute top-2.5 left-2.5 rounded-md bg-violet-700/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      AI Generated
                    </span>
                  </div>
                  <div className="p-3.5 space-y-2.5">
                    <p className="text-xs text-slate-800 dark:text-slate-100 line-clamp-2">
                      {lastGenerated.prompt}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {lastGenerated.modelUsed || 'gemini-nano-banana-2.1'} ·{' '}
                      {lastGenerated.width && lastGenerated.height
                        ? `${lastGenerated.width}×${lastGenerated.height} px`
                        : `${lastGenerated.aspectRatio} · ${lastGenerated.imageSize || '2K'}`}
                      {lastGenerated.mimeType ? ` · ${lastGenerated.mimeType}` : ''}
                      {lastGenerated.byteLength ? ` · ${formatByteLabel(lastGenerated.byteLength)}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void runGenerateImage(lastGenerated.prompt)}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/15 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-white/10"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Regenerate</span>
                      </button>
                      {onSendImageToPdf && (
                        <button
                          type="button"
                          onClick={() =>
                            onSendImageToPdf({
                              id: lastGenerated.id,
                              dataUrl: lastGenerated.dataUrl,
                              caption: lastGenerated.prompt,
                              sourceKind: 'ai_generated',
                              attribution: `AI Generated via ${lastGenerated.modelUsed || 'Gemini Image'}`,
                            })
                          }
                          className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500"
                        >
                          <FilePlus2 className="h-3.5 w-3.5" />
                          <span>Send to PDF Studio</span>
                        </button>
                      )}
                      <a
                        href={lastGenerated.dataUrl}
                        download={`nova-ai-${lastGenerated.id}.png`}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-violet-400/30 px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/10"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : (
            /* REAL PHOTOGRAPH SEARCH WORKBENCH */
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Real Photograph Search
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Verified real camera photography with attribution &amp; license metadata (never AI synthetic)
                </p>
              </div>

              <form onSubmit={(e) => void handleSearchRealPhotos(e)} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="search"
                    value={photoQuery}
                    onChange={(e) => setPhotoQuery(e.target.value)}
                    placeholder="Search real photos (e.g. 'Kyoto temple', 'solar panels', 'ocean cliff')..."
                    className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
                  />
                  <select
                    value={photoProvider}
                    onChange={(e) => setPhotoProvider(e.target.value as ImageSearchProviderId)}
                    className="min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-800 dark:text-slate-200 focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="auto">Auto Provider</option>
                    <option value="wikimedia">Wikimedia Commons (Zero Key)</option>
                    <option value="pexels">
                      Pexels {providerStatus?.pexelsConfigured ? '(Active)' : '(Env Key)'}
                    </option>
                    <option value="unsplash">
                      Unsplash {providerStatus?.unsplashConfigured ? '(Active)' : '(Env Key)'}
                    </option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={photoLoading || !photoQuery.trim()}
                  className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  <Search className="h-4 w-4" />
                  <span>{photoLoading ? 'Searching Real Photographs...' : 'Search Real Photographs'}</span>
                </button>
              </form>

              {photoError && (
                <div className="rounded-xl border border-rose-400/35 bg-rose-50 dark:bg-rose-950/35 p-3 text-xs text-rose-800 dark:text-rose-200">
                  {photoError}
                </div>
              )}

              {photoLoading ? (
                <div className="py-8 flex justify-center">
                  <NovaMiniPlanetLoader size="md" label="Fetching verified photographs..." />
                </div>
              ) : photoResults.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  Search above to browse real licensed photographs from Wikimedia Commons, Pexels, or Unsplash.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Showing {photoResults.length} real photographs from{' '}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300 capitalize">
                      {photoProviderUsed}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[540px] overflow-y-auto pr-1">
                    {photoResults.map((photo) => {
                      const isBusy = busyPhotoId === photo.id;
                      return (
                        <div
                          key={photo.id}
                          className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] overflow-hidden flex flex-col"
                        >
                          <div className="relative">
                            <img
                              src={photo.thumbUrl}
                              alt={photo.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-40 object-cover bg-black/15 cursor-pointer"
                              onClick={() =>
                                setPreviewItem({
                                  dataUrl: photo.fullUrl,
                                  title: photo.title,
                                  sourceKind: 'real_photo',
                                  metaLine: `Real Photograph · ${photo.width}×${photo.height} · ${photo.provider}`,
                                  attribution: photo.attributionText,
                                  externalUrl: photo.fullUrl,
                                })
                              }
                            />
                            <span className="absolute top-2 left-2 rounded-md bg-emerald-700/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                              Real Photo
                            </span>
                          </div>
                          <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                            <div>
                              <div className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-1">
                                {photo.title}
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                                {photo.photographer} · {photo.license}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSaveRealPhotoToGallery(photo, false)}
                                className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 dark:border-white/15 px-2.5 text-[11px] font-medium text-slate-800 dark:text-slate-200 hover:bg-white/10 disabled:opacity-50"
                              >
                                <Download className="h-3 w-3" />
                                <span>{isBusy ? 'Saving...' : 'Save'}</span>
                              </button>
                              {onSendImageToPdf && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleSaveRealPhotoToGallery(photo, true)}
                                  className="flex min-h-[34px] items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                                >
                                  <FilePlus2 className="h-3 w-3" />
                                  <span>Use in PDF</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* RIGHT GALLERY: Strictly Distinguishes AI-Generated vs Real Photos vs Uploads */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                NOVA Media Gallery
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {savedImages.length} total · strictly separated by provenance
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={galleryUploadInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadDevicePhoto(f, 'gallery');
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => galleryUploadInput.current?.click()}
                className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-violet-400"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Photo</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-white/10 pb-3">
            {[
              { id: 'all' as const, label: `All (${savedImages.length})` },
              {
                id: 'ai' as const,
                label: `AI Generated (${savedImages.filter((i) => !i.sourceKind || i.sourceKind === 'ai_generated').length})`,
              },
              {
                id: 'real' as const,
                label: `Real Photos & Uploads (${savedImages.filter((i) => i.sourceKind === 'real_photo' || i.sourceKind === 'uploaded').length})`,
              },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setGalleryFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors tabular-nums ${
                  galleryFilter === f.id
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredGallery.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <ImageIcon className="h-8 w-8 mx-auto text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No images in this category yet. Generate an AI image, search real photographs, or upload a photo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[620px] overflow-y-auto pr-1">
              {filteredGallery.map((img) => {
                const kind = img.sourceKind || 'ai_generated';
                const badgeLabel =
                  kind === 'ai_generated'
                    ? 'AI Generated'
                    : kind === 'real_photo'
                    ? 'Real Photograph'
                    : 'Uploaded Photo';
                const badgeClasses =
                  kind === 'ai_generated'
                    ? 'bg-violet-700/90 text-white'
                    : kind === 'real_photo'
                    ? 'bg-emerald-700/90 text-white'
                    : 'bg-sky-700/90 text-white';

                return (
                  <div
                    key={img.id}
                    className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] overflow-hidden flex flex-col"
                  >
                    <div className="relative group">
                      <img
                        src={img.dataUrl}
                        alt={img.prompt}
                        referrerPolicy="no-referrer"
                        className="w-full h-44 object-contain bg-black/20 cursor-pointer"
                        onClick={() =>
                          setPreviewItem({
                            dataUrl: img.dataUrl,
                            title: img.prompt,
                            sourceKind: kind,
                            metaLine: `${badgeLabel} · ${
                              img.width && img.height ? `${img.width}×${img.height} px · ` : ''
                            }${img.aspectRatio}${img.imageSize ? ` · ${img.imageSize}` : ''}${
                              img.mimeType ? ` · ${img.mimeType}` : ''
                            }${img.byteLength ? ` · ${formatByteLabel(img.byteLength)}` : ''} · ${img.createdAt}`,
                            attribution: img.attribution,
                            promptForRegen: kind === 'ai_generated' ? img.prompt : undefined,
                            aspectRatio: img.aspectRatio,
                            imageSize: img.imageSize,
                          })
                        }
                      />
                      <span
                        className={`absolute top-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClasses}`}
                      >
                        {badgeLabel}
                      </span>
                      <button
                        type="button"
                        aria-label="Inspect full size"
                        onClick={() =>
                          setPreviewItem({
                            dataUrl: img.dataUrl,
                            title: img.prompt,
                            sourceKind: kind,
                            metaLine: `${badgeLabel} · ${
                              img.width && img.height ? `${img.width}×${img.height} px · ` : ''
                            }${img.aspectRatio}${img.imageSize ? ` · ${img.imageSize}` : ''}${
                              img.mimeType ? ` · ${img.mimeType}` : ''
                            }${img.byteLength ? ` · ${formatByteLabel(img.byteLength)}` : ''} · ${img.createdAt}`,
                            attribution: img.attribution,
                            promptForRegen: kind === 'ai_generated' ? img.prompt : undefined,
                            aspectRatio: img.aspectRatio,
                            imageSize: img.imageSize,
                          })
                        }
                        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white opacity-90 hover:opacity-100"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                          {img.prompt}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums line-clamp-1">
                          {img.modelUsed ? `${img.modelUsed} · ` : img.provider ? `${img.provider} · ` : ''}
                          {img.width && img.height
                            ? `${img.width}×${img.height} px`
                            : `${img.aspectRatio}${img.imageSize ? ` · ${img.imageSize}` : ''}`}
                          {img.byteLength ? ` · ${formatByteLabel(img.byteLength)}` : ''} · {img.createdAt}
                        </p>
                        {img.attribution && (
                          <p className="mt-0.5 text-[10px] text-emerald-700 dark:text-emerald-300 line-clamp-1">
                            {img.attribution}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {onSendImageToPdf && (
                            <button
                              type="button"
                              onClick={() =>
                                onSendImageToPdf({
                                  id: img.id,
                                  dataUrl: img.dataUrl,
                                  caption: img.prompt,
                                  sourceKind: kind,
                                  attribution: img.attribution,
                                })
                              }
                              className="flex min-h-[34px] items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-[11px] font-semibold text-white hover:bg-violet-500"
                            >
                              <FilePlus2 className="h-3 w-3" />
                              <span>To PDF</span>
                            </button>
                          )}
                          <a
                            href={img.dataUrl}
                            download={`nova-${img.id}.png`}
                            className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 dark:border-white/15 px-2.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-white/10"
                          >
                            <Download className="h-3 w-3" />
                            <span>Save</span>
                          </a>
                          {kind === 'ai_generated' && (
                            <button
                              type="button"
                              onClick={() => {
                                setStudioTab('generate');
                                setPrompt(img.prompt);
                                void runGenerateImage(img.prompt);
                              }}
                              className="flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 dark:border-white/15 px-2.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-white/10"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => onDeleteImage(img.id)}
                          aria-label="Delete image"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* High-Resolution Image Preview Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-white/15 bg-[#120D1F] text-white overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{previewItem.title}</div>
                <div className="text-xs text-slate-400">{previewItem.metaLine}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                aria-label="Close preview"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-black/50 flex items-center justify-center p-4 max-h-[65vh]">
              <img
                src={previewItem.dataUrl}
                alt={previewItem.title}
                referrerPolicy="no-referrer"
                className="max-h-[58vh] w-auto object-contain rounded-xl"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3.5">
              <div className="text-xs text-slate-300">
                {previewItem.attribution ||
                  (previewItem.sourceKind === 'ai_generated'
                    ? 'Synthetic AI artwork generated inside NOVA Image Studio.'
                    : 'Local photo asset ready for download or PDF layout.')}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {previewItem.promptForRegen && (
                  <button
                    type="button"
                    onClick={() => {
                      const regen = previewItem.promptForRegen!;
                      setPreviewItem(null);
                      setStudioTab('generate');
                      setPrompt(regen);
                      void runGenerateImage(regen);
                    }}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/15 px-3 text-xs font-medium hover:bg-white/10"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Regenerate</span>
                  </button>
                )}
                {onSendImageToPdf && !previewItem.externalUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      onSendImageToPdf({
                        id: `preview-${Date.now()}`,
                        dataUrl: previewItem.dataUrl,
                        caption: previewItem.title,
                        sourceKind: previewItem.sourceKind,
                        attribution: previewItem.attribution,
                      });
                      setPreviewItem(null);
                    }}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    <span>Send to PDF Studio</span>
                  </button>
                )}
                {previewItem.externalUrl ? (
                  <a
                    href={previewItem.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/15 px-3.5 text-xs font-medium hover:bg-white/10"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Source</span>
                  </a>
                ) : (
                  <a
                    href={previewItem.dataUrl}
                    download="nova-image.png"
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/15 px-3.5 text-xs font-medium hover:bg-white/10"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download PNG</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
