import express, { type Request, type Response, type Router } from 'express';
import { GoogleGenAI, Type, type Part } from '@google/genai';

export interface MediaStudioRouteDeps {
  getAiClient: (apiVersion?: string) => GoogleGenAI;
  getGeminiErrorStatus: (err: unknown) => { status: number; message: string; paidKeyRequired?: boolean };
  recordApiTelemetry: (
    endpoint: string,
    model: string,
    status: number,
    latencyMs: number,
    ok: boolean,
    message: string
  ) => void;
}

const ALLOWED_PROXY_HOSTS = new Set([
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'images.pexels.com',
  'images.unsplash.com',
]);

const ALLOWED_ASPECT_RATIOS = new Set([
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '4:1',
  '1:4',
]);

const ALLOWED_IMAGE_SIZES = new Set(['1K', '2K', '4K']);

const STYLE_MODIFIERS: Record<string, string> = {
  auto: 'well-balanced composition, nuanced natural lighting, crisp fine textures, layered depth, harmonious color grading, clean ultra-detailed rendering',
  photorealistic:
    'shot on full-frame 50mm f/1.8 prime lens, lifelike natural daylight and global illumination, authentic surface micro-textures, soft optical depth of field, true-to-life dynamic range and subtle photographic film grain',
  cinematic:
    'anamorphic widescreen cinema still aesthetic, atmospheric depth haze, dramatic key light with subtle rim separation, teal-and-amber or rich tonal film color grading, masterful foreground-midground-background framing',
  anime:
    'modern high-budget theatrical anime feature background and character art, luminous cel shading, crisp expressive line art, radiant atmospheric shafts of light, rich painted sky and intricate environmental detail',
  wallpaper:
    'sleek high-resolution desktop/mobile wallpaper composition with clean focal hierarchy and atmospheric negative space, crisp edge-to-edge clarity, rich luminous gradients, zero muddiness',
  fantasy:
    'epic high-fantasy concept illustration, awe-inspiring monumental scale, volumetric god rays, intricate painterly atmospheric brushwork, rich lore-filled architectural and botanical textures',
  architecture:
    'architectural digest photography, crisp vertical perspectives, golden hour warm sunlight contrasting against sky tones, tactile stone/glass/timber material fidelity, atmospheric stillness',
  product:
    'luxury commercial studio product photography, precision softbox diffusers with clean specular highlights, tactile material clarity, subtle contact shadow, shallow studio background separation',
  '3d_artwork':
    'physically based 3D path-traced studio render, Octane aesthetic, clean specular reflections, subsurface scattering, soft indirect global illumination, crisp micro-bevels and material fidelity',
  character:
    'detailed character concept illustration, dynamic expressive silhouette and anatomy, crisp rim lighting separating subject from atmospheric backdrop, intricate fabric weave and accessory textures',
  educational:
    'clean publication-grade educational illustration, crystal-clear visual hierarchy, well-lit structural separation of components, accurate proportions, coherent didactic palette without cluttered text artifacts',
};

function buildEnhancedArtPrompt(
  rawPrompt: string,
  stylePreset = 'auto',
  enhance = true
): string {
  const clean = rawPrompt.trim();
  if (!enhance && stylePreset === 'auto') return clean;
  const modifier = STYLE_MODIFIERS[stylePreset] || STYLE_MODIFIERS.auto;
  if (!enhance) {
    return `${clean} — rendered in ${stylePreset.replace(/_/g, ' ')} visual style.`;
  }
  return `${clean}. Artistic direction: preserve the exact intended subject and action while elevating visual execution with ${modifier}. Avoid watermarks, signatures, cropped limbs, muddy lighting, or low-resolution artifacts.`;
}

function getImageDimensionsFromBuffer(
  buf: Buffer,
  mimeType: string
): { width: number; height: number } | null {
  try {
    const lower = mimeType.toLowerCase();
    // PNG IHDR header
    if (
      buf.length >= 24 &&
      (lower.includes('png') ||
        (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47))
    ) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    }
    // JPEG SOF0/SOF1/SOF2 marker scan
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        if (
          marker === 0xc0 ||
          marker === 0xc1 ||
          marker === 0xc2 ||
          marker === 0xc3
        ) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) return { width, height };
        }
        const segLen = buf.readUInt16BE(offset + 2);
        if (segLen < 2) break;
        offset += 2 + segLen;
      }
    }
    // WebP VP8 / VP8L / VP8X
    if (buf.length >= 30 && buf.subarray(0, 4).toString('ascii') === 'RIFF') {
      const chunk = buf.subarray(12, 16).toString('ascii');
      if (chunk === 'VP8X' && buf.length >= 30) {
        const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { width: w, height: h };
      }
    }
  } catch {
    // ignore parse edge cases
  }
  return null;
}

interface DailyUsageTracker {
  dateKey: string;
  imagesGeneratedToday: number;
  photoSearchesToday: number;
  pdfGenerationsToday: number;
}

const usageTracker: DailyUsageTracker = {
  dateKey: new Date().toISOString().slice(0, 10),
  imagesGeneratedToday: 0,
  photoSearchesToday: 0,
  pdfGenerationsToday: 0,
};

function syncUsageDay(): DailyUsageTracker {
  const today = new Date().toISOString().slice(0, 10);
  if (usageTracker.dateKey !== today) {
    usageTracker.dateKey = today;
    usageTracker.imagesGeneratedToday = 0;
    usageTracker.photoSearchesToday = 0;
    usageTracker.pdfGenerationsToday = 0;
  }
  return usageTracker;
}

function getDailyImageLimit(): number {
  const n = Number(process.env.IMAGE_GEN_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.min(1000, Math.floor(n)) : 30;
}

function getDailyPhotoSearchLimit(): number {
  const n = Number(process.env.PHOTO_SEARCH_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.min(2000, Math.floor(n)) : 120;
}

function stripHtmlTags(raw: string): string {
  return String(raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getStudioProviderStatusPayload() {
  const usage = syncUsageDay();
  return {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    pexelsConfigured: Boolean(process.env.PEXELS_API_KEY?.trim()),
    unsplashConfigured: Boolean(process.env.UNSPLASH_ACCESS_KEY?.trim()),
    wikimediaActive: true,
    pdfEngineLocal: true,
    usage: {
      dateKey: usage.dateKey,
      imagesGeneratedToday: usage.imagesGeneratedToday,
      dailyImageLimit: getDailyImageLimit(),
      photoSearchesToday: usage.photoSearchesToday,
      dailyPhotoSearchLimit: getDailyPhotoSearchLimit(),
      pdfGenerationsToday: usage.pdfGenerationsToday,
    },
  };
}

const WIKIMEDIA_USER_AGENT = 'NOVA-AI-Studio/1.0 (https://localhost; nova-studio@example.org)';

async function searchWikimediaPhotos(query: string, perPage: number) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrsearch', `${query} filetype:bitmap`);
  url.searchParams.set('gsrlimit', String(Math.min(30, Math.max(12, perPage * 2))));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  url.searchParams.set('iiurlwidth', '800');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': WIKIMEDIA_USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Wikimedia Commons returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          pageid: number;
          title: string;
          imageinfo?: Array<{
            url?: string;
            thumburl?: string;
            width?: number;
            height?: number;
            mime?: string;
            extmetadata?: Record<string, { value?: string }>;
          }>;
        }
      >;
    };
  };

  const pages = Object.values(data.query?.pages || {});
  const results = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.url || !info.mime) continue;
    const mimeLower = info.mime.toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeLower)) continue;
    if (Number(info.width || 0) < 300 || Number(info.height || 0) < 200) continue;

    const thumbUrl = info.thumburl || info.url;
    if (
      !thumbUrl.startsWith('https://upload.wikimedia.org/') &&
      !thumbUrl.startsWith('https://thumb.wikimedia.org/')
    ) {
      continue;
    }

    const meta = info.extmetadata || {};
    const artist = stripHtmlTags(meta.Artist?.value || 'Wikimedia Contributor').slice(0, 80) || 'Wikimedia Contributor';
    const license = stripHtmlTags(meta.LicenseShortName?.value || 'Creative Commons / Free').slice(0, 60);
    const licenseUrl = meta.LicenseUrl?.value;
    const cleanTitle = page.title.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');

    results.push({
      id: `wm-${page.pageid}`,
      title: cleanTitle || query,
      photographer: artist,
      license,
      licenseUrl,
      provider: 'Wikimedia Commons' as const,
      width: Number(info.width || 800),
      height: Number(info.height || 600),
      thumbUrl,
      fullUrl: thumbUrl,
      attributionText: `Photo by ${artist} · ${license} · Wikimedia Commons`,
    });
    if (results.length >= perPage) break;
  }
  return results;
}

async function searchPexelsPhotos(query: string, perPage: number) {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY is not configured in server environment secrets.');
  }
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(Math.min(18, Math.max(4, perPage))));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Pexels API returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    photos?: Array<{
      id: number;
      alt?: string;
      photographer?: string;
      width?: number;
      height?: number;
      src?: { medium?: string; large?: string; original?: string };
    }>;
  };
  return (data.photos || []).map((p) => ({
    id: `px-${p.id}`,
    title: p.alt || query,
    photographer: p.photographer || 'Pexels Photographer',
    license: 'Pexels License (Free Commercial Use)',
    licenseUrl: 'https://www.pexels.com/license/',
    provider: 'Pexels' as const,
    width: Number(p.width || 1200),
    height: Number(p.height || 800),
    thumbUrl: p.src?.medium || p.src?.large || '',
    fullUrl: p.src?.large || p.src?.original || '',
    attributionText: `Photo by ${p.photographer || 'Pexels Creator'} via Pexels`,
  }));
}

async function searchUnsplashPhotos(query: string, perPage: number) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) {
    throw new Error('UNSPLASH_ACCESS_KEY is not configured in server environment secrets.');
  }
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(Math.min(18, Math.max(4, perPage))));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Unsplash API returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    results?: Array<{
      id: string;
      alt_description?: string;
      description?: string;
      width?: number;
      height?: number;
      user?: { name?: string };
      urls?: { small?: string; regular?: string };
    }>;
  };
  return (data.results || []).map((p) => ({
    id: `un-${p.id}`,
    title: p.alt_description || p.description || query,
    photographer: p.user?.name || 'Unsplash Photographer',
    license: 'Unsplash License (Free Use)',
    licenseUrl: 'https://unsplash.com/license',
    provider: 'Unsplash' as const,
    width: Number(p.width || 1200),
    height: Number(p.height || 800),
    thumbUrl: p.urls?.small || p.urls?.regular || '',
    fullUrl: p.urls?.regular || '',
    attributionText: `Photo by ${p.user?.name || 'Unsplash Creator'} on Unsplash`,
  }));
}

export function createMediaStudioRouter(deps: MediaStudioRouteDeps): Router {
  const router = express.Router();

  router.get('/config', (_req: Request, res: Response) => {
    res.json(getStudioProviderStatusPayload());
  });

  // Style-preserving Prompt Enhancer Preview
  router.post('/enhance-prompt', async (req: Request, res: Response) => {
    const rawPrompt = String(req.body?.prompt || '').trim();
    const stylePreset = String(req.body?.stylePreset || 'auto');
    if (!rawPrompt) {
      res.status(400).json({ error: 'Provide a prompt to enhance.' });
      return;
    }

    const fallbackEnhanced = buildEnhancedArtPrompt(rawPrompt, stylePreset, true);
    try {
      const ai = deps.getAiClient();
      const resp = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Rewrite and enrich this image generation prompt to produce premium museum/studio-grade artwork in style "${stylePreset.replace(
          /_/g,
          ' '
        )}" while strictly keeping the user's exact subject, action, and intent intact. Upgrade lighting, composition, textures, atmospheric depth, color grading, and lens/brush detail in 2-3 cohesive sentences without adding clickbait buzzwords.\n\nUser prompt: "${rawPrompt}"`,
      });
      const text = (resp.text || '').trim();
      res.json({ enhancedPrompt: text || fallbackEnhanced });
    } catch {
      res.json({ enhancedPrompt: fallbackEnhanced });
    }
  });

  // Enhanced AI Image Generation with Size, Aspect Ratio, Prompt Enrichment, Retry & Raw Byte Verification
  router.post('/generate-image', async (req: Request, res: Response) => {
    const startMs = Date.now();
    const usage = syncUsageDay();
    const limit = getDailyImageLimit();

    if (usage.imagesGeneratedToday >= limit) {
      res.status(429).json({
        error: `Daily AI image generation limit reached (${limit}/${limit}). Try again tomorrow or search free real photographs.`,
        usage: getStudioProviderStatusPayload().usage,
      });
      return;
    }

    try {
      const ai = deps.getAiClient('v1beta');
      const {
        prompt,
        aspectRatio = '1:1',
        imageSize = '2K',
        quality = 'pro',
        stylePreset = 'auto',
        enhancePrompt = true,
        sourceImageBase64,
        sourceMimeType = 'image/png',
      } = req.body ?? {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Please enter an image prompt.' });
        return;
      }

      const safeAspect = ALLOWED_ASPECT_RATIOS.has(String(aspectRatio))
        ? String(aspectRatio)
        : '1:1';
      const safeSize = ALLOWED_IMAGE_SIZES.has(String(imageSize)) ? String(imageSize) : '2K';
      const finalPrompt = buildEnhancedArtPrompt(
        prompt,
        String(stylePreset || 'auto'),
        enhancePrompt !== false
      ).slice(0, 2600);

      const needsPro =
        quality === 'pro' ||
        safeSize === '2K' ||
        safeSize === '4K' ||
        safeAspect === '4:1' ||
        safeAspect === '1:4' ||
        safeAspect === '3:2' ||
        safeAspect === '2:3';

      const modelCandidates = needsPro
        ? ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image']
        : ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1'];

      const baseParts: Part[] = [];
      if (sourceImageBase64 && typeof sourceImageBase64 === 'string') {
        const cleanData = sourceImageBase64.replace(/^data:[^;]+;base64,/, '');
        const matchedMime =
          sourceImageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/)?.[1] ||
          String(sourceMimeType || 'image/png');
        baseParts.push({
          inlineData: {
            mimeType: matchedMime,
            data: cleanData,
          },
        });
      }
      baseParts.push({ text: finalPrompt });

      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let modelUsed = modelCandidates[0];
      let lastErr: unknown = null;

      for (let mIdx = 0; mIdx < modelCandidates.length; mIdx++) {
        const candidateModel = modelCandidates[mIdx];
        const isProCandidate = candidateModel === 'gemini-nano-banana-2.1';
        const effectiveAspect =
          !isProCandidate &&
          (safeAspect === '4:1' || safeAspect === '1:4' || safeAspect === '3:2' || safeAspect === '2:3')
            ? safeAspect === '3:2' || safeAspect === '4:1'
              ? '16:9'
              : '9:16'
            : safeAspect;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await ai.models.generateContent({
              model: candidateModel,
              contents: { parts: baseParts },
              config: {
                imageConfig: {
                  aspectRatio: effectiveAspect,
                  ...(isProCandidate ? { imageSize: safeSize } : {}),
                },
              },
            });
            modelUsed = candidateModel;
            break;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isTransient =
              msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('500');
            if (isTransient && attempt === 0) {
              await new Promise((r) => setTimeout(r, 450));
              continue;
            }
            const shouldTryNextModel =
              msg.includes('NOT_FOUND') ||
              msg.includes('404') ||
              msg.includes('INVALID_ARGUMENT') ||
              isTransient;
            if (!shouldTryNextModel) {
              throw err;
            }
            break;
          }
        }
        if (response) break;
      }

      if (!response) {
        throw lastErr || new Error('Gemini image generation failed across candidate models.');
      }

      let rawBase64 = '';
      let detectedMime = 'image/png';
      let caption = '';
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data && !rawBase64) {
          rawBase64 = part.inlineData.data;
          detectedMime = part.inlineData.mimeType || 'image/png';
        } else if (part.text) {
          caption += part.text;
        }
      }

      if (!rawBase64) {
        deps.recordApiTelemetry(
          '/api/nova/media-studio/generate-image',
          modelUsed,
          502,
          Date.now() - startMs,
          false,
          'Empty image payload'
        );
        res.status(502).json({
          error:
            'Gemini returned no image bytes for this prompt. Please refine your prompt and try again.',
        });
        return;
      }

      const rawBuffer = Buffer.from(rawBase64, 'base64');
      const dims = getImageDimensionsFromBuffer(rawBuffer, detectedMime);
      const imageDataUrl = `data:${detectedMime};base64,${rawBase64}`;

      usage.imagesGeneratedToday += 1;
      deps.recordApiTelemetry(
        '/api/nova/media-studio/generate-image',
        modelUsed,
        200,
        Date.now() - startMs,
        true,
        `Generated ${dims ? `${dims.width}x${dims.height}` : safeAspect} (${detectedMime})`
      );
      res.json({
        imageDataUrl,
        caption: caption.trim(),
        modelUsed,
        aspectRatio: safeAspect,
        imageSize: modelUsed === 'gemini-nano-banana-2.1' ? safeSize : '1K',
        mimeType: detectedMime,
        byteLength: rawBuffer.byteLength,
        width: dims?.width,
        height: dims?.height,
        enhancedPromptUsed: finalPrompt,
        usage: getStudioProviderStatusPayload().usage,
      });
    } catch (err) {
      const { status, message, paidKeyRequired } = deps.getGeminiErrorStatus(err);
      deps.recordApiTelemetry(
        '/api/nova/media-studio/generate-image',
        'gemini-image',
        status,
        Date.now() - startMs,
        false,
        message
      );
      res.status(status).json({
        error: message,
        ...(paidKeyRequired ? { paidKeyRequired } : {}),
        usage: getStudioProviderStatusPayload().usage,
      });
    }
  });

  // Real Photograph Search (Wikimedia Commons Zero-Key + Optional Pexels / Unsplash)
  router.post('/search-photos', async (req: Request, res: Response) => {
    const startMs = Date.now();
    const usage = syncUsageDay();
    const limit = getDailyPhotoSearchLimit();

    if (usage.photoSearchesToday >= limit) {
      res.status(429).json({
        error: `Daily real photograph search limit reached (${limit}/${limit}).`,
        usage: getStudioProviderStatusPayload().usage,
      });
      return;
    }

    try {
      const { query, provider = 'auto', perPage = 12 } = req.body ?? {};
      const cleanQuery = String(query || '').trim();
      if (!cleanQuery) {
        res.status(400).json({ error: 'Please enter search keywords for real photographs.' });
        return;
      }

      const count = Math.min(18, Math.max(4, Number(perPage) || 12));
      let chosenProvider: 'wikimedia' | 'pexels' | 'unsplash' = 'wikimedia';

      if (provider === 'pexels') {
        chosenProvider = 'pexels';
      } else if (provider === 'unsplash') {
        chosenProvider = 'unsplash';
      } else if (provider === 'wikimedia') {
        chosenProvider = 'wikimedia';
      } else {
        if (process.env.PEXELS_API_KEY?.trim()) chosenProvider = 'pexels';
        else if (process.env.UNSPLASH_ACCESS_KEY?.trim()) chosenProvider = 'unsplash';
        else chosenProvider = 'wikimedia';
      }

      let results;
      if (chosenProvider === 'pexels') {
        results = await searchPexelsPhotos(cleanQuery, count);
      } else if (chosenProvider === 'unsplash') {
        results = await searchUnsplashPhotos(cleanQuery, count);
      } else {
        results = await searchWikimediaPhotos(cleanQuery, count);
      }

      usage.photoSearchesToday += 1;
      deps.recordApiTelemetry('/api/nova/media-studio/search-photos', chosenProvider, 200, Date.now() - startMs, true, `${results.length} photos`);
      res.json({
        providerUsed: chosenProvider,
        results,
        usage: getStudioProviderStatusPayload().usage,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Photo search failed.';
      deps.recordApiTelemetry('/api/nova/media-studio/search-photos', 'photo-search', 502, Date.now() - startMs, false, msg);
      res.status(502).json({ error: msg });
    }
  });

  // Strict Allowlisted Image Fetcher -> Base64 Data URL for CORS-safe PDF Embedding & Download
  router.post('/proxy-photo', async (req: Request, res: Response) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      if (!rawUrl) {
        res.status(400).json({ error: 'Missing photo URL.' });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        res.status(400).json({ error: 'Invalid photo URL.' });
        return;
      }

      if (parsed.protocol !== 'https:' || !ALLOWED_PROXY_HOSTS.has(parsed.hostname)) {
        res.status(403).json({ error: 'Photo host is not on the verified stock/commons allowlist.' });
        return;
      }

      const upstream = await fetch(parsed.toString(), {
        headers: {
          'User-Agent': WIKIMEDIA_USER_AGENT,
          Accept: 'image/*,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      if (!upstream.ok) {
        res.status(502).json({ error: `Upstream photo fetch failed (${upstream.status}).` });
        return;
      }

      const finalParsed = new URL(upstream.url || parsed.toString());
      if (finalParsed.protocol !== 'https:' || !ALLOWED_PROXY_HOSTS.has(finalParsed.hostname)) {
        res.status(403).json({ error: 'Redirected photo host blocked.' });
        return;
      }

      const mimeType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!mimeType.startsWith('image/')) {
        res.status(400).json({ error: 'URL did not return valid image bytes.' });
        return;
      }

      const arrayBuf = await upstream.arrayBuffer();
      if (arrayBuf.byteLength > 10 * 1024 * 1024) {
        res.status(413).json({ error: 'Photograph exceeds 10MB PDF embed limit.' });
        return;
      }

      const base64 = Buffer.from(arrayBuf).toString('base64');
      res.json({
        dataUrl: `data:${mimeType.split(';')[0]};base64,${base64}`,
        mimeType: mimeType.split(';')[0],
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to fetch photograph for PDF embedding.',
      });
    }
  });

  // Rich Structured PDF Blueprint Generator (Headings, Paragraphs, Bullets, Tables & Charts)
  router.post('/generate-pdf-blueprint', async (req: Request, res: Response) => {
    const startMs = Date.now();
    const usage = syncUsageDay();
    try {
      const ai = deps.getAiClient();
      const {
        instructions,
        sourceText = '',
        title = '',
        tone = 'professional',
        includeTable = true,
        includeChart = true,
      } = req.body ?? {};

      const cleanInstr = String(instructions || '').trim();
      const cleanSource = String(sourceText || '').trim().slice(0, 18000);
      if (!cleanInstr && !cleanSource) {
        res.status(400).json({ error: 'Provide instructions or document text to create a PDF.' });
        return;
      }

      const prompt = [
        cleanInstr ? `User instructions: ${cleanInstr}` : 'Structure and polish this uploaded document cleanly for executive PDF presentation.',
        title ? `Document title: ${title}` : '',
        `Tone: ${tone}.`,
        cleanSource ? `Source document content:\n${cleanSource}` : '',
        includeTable ? 'Include at least 1 structured comparison/summary table where helpful.' : 'Do not generate tables unless strictly required.',
        includeChart ? 'Include at least 1 crisp quantitative chart specification (bar, line, or pie) summarizing real numbers/metrics mentioned or illustrative benchmark data.' : 'Omit charts if no quantitative theme applies.',
      ]
        .filter(Boolean)
        .join('\n\n');

      const schema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          author: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                paragraphs: { type: Type.ARRAY, items: { type: Type.STRING } },
                bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['heading', 'paragraphs', 'bullets'],
            },
          },
          tables: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: {
                  type: Type.ARRAY,
                  items: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
              },
              required: ['title', 'headers', 'rows'],
            },
          },
          charts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                chartType: { type: Type.STRING, description: 'bar, line, or pie' },
                unitLabel: { type: Type.STRING },
                data: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      value: { type: Type.NUMBER },
                    },
                    required: ['label', 'value'],
                  },
                },
              },
              required: ['title', 'chartType', 'data'],
            },
          },
        },
        required: ['title', 'subtitle', 'sections'],
      };

      let response;
      let modelUsed = 'gemini-4-hydrogen';
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction:
              'You are NOVA PDF Studio Architect. Produce cohesive, publication-ready document blocks with clean headings, readable prose, compact tables (2-4 columns), and chart series with 3-7 data points.',
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        });
      } catch {
        modelUsed = 'gemini-3.1-flash-lite';
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction:
              'You are NOVA PDF Studio Architect. Produce cohesive, publication-ready document blocks with clean headings, readable prose, compact tables (2-4 columns), and chart series with 3-7 data points.',
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        });
      }

      const parsed = JSON.parse((response.text || '{}').trim());
      usage.pdfGenerationsToday += 1;
      deps.recordApiTelemetry('/api/nova/media-studio/generate-pdf-blueprint', modelUsed, 200, Date.now() - startMs, true, 'PDF blueprint ready');
      res.json({
        blueprint: parsed,
        modelUsed,
        usage: getStudioProviderStatusPayload().usage,
      });
    } catch (err) {
      const { status, message } = deps.getGeminiErrorStatus(err);
      deps.recordApiTelemetry('/api/nova/media-studio/generate-pdf-blueprint', 'gemini-4-hydrogen', status, Date.now() - startMs, false, message);
      res.status(status).json({ error: message });
    }
  });

  // Live Provider Health Test (triggered from NOVA Settings & Media Studio)
  router.post('/test-provider', async (req: Request, res: Response) => {
    const { provider = 'wikimedia' } = req.body ?? {};
    try {
      if (provider === 'wikimedia') {
        const items = await searchWikimediaPhotos('mountain landscape', 2);
        res.json({
          ok: items.length > 0,
          message: `Wikimedia Commons active (${items.length} verified CC photos retrieved with zero key required).`,
        });
        return;
      }
      if (provider === 'pexels') {
        const items = await searchPexelsPhotos('architecture', 2);
        res.json({ ok: items.length > 0, message: `Pexels connected (${items.length} sample results).` });
        return;
      }
      if (provider === 'unsplash') {
        const items = await searchUnsplashPhotos('nature', 2);
        res.json({ ok: items.length > 0, message: `Unsplash connected (${items.length} sample results).` });
        return;
      }
      res.status(400).json({ ok: false, error: 'Unsupported provider identifier.' });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Provider check failed.',
      });
    }
  });

  return router;
}
