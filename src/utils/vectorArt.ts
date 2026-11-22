function getAspectDimensions(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1280, height: 720 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 768, height: 1024 };
    default:
      return { width: 1024, height: 1024 };
  }
}

export function sanitizeSvgMarkup(rawSvg: string): string {
  return rawSvg
    .replace(/```(?:svg|xml|html)?/gi, '')
    .replace(/```/g, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .trim();
}

export async function svgToPngDataUrl(svgMarkup: string, aspectRatio = '1:1'): Promise<string> {
  const { width, height } = getAspectDimensions(aspectRatio);
  const cleanSvg = sanitizeSvgMarkup(svgMarkup);

  return new Promise((resolve) => {
    const svgBlob = new Blob([cleanSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#07040E';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const png = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve(png);
          return;
        }
      } catch {
        // Fallback to raw SVG data URL if canvas tainting occurs
      }
      URL.revokeObjectURL(url);
      resolve(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`);
    };
    img.src = url;
  });
}

export function createOfflineProceduralSvg(prompt: string, aspectRatio = '1:1'): string {
  const { width, height } = getAspectDimensions(aspectRatio);
  const lower = prompt.toLowerCase();
  const cx = Math.round(width / 2);
  const cy = Math.round(height * 0.43);
  const radius = Math.round(Math.min(width, height) * 0.19);

  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }

  const isSunset = /\b(sunset|sunrise|sun|desert|dusk|dawn)\b/.test(lower);
  const isOcean = /\b(ocean|sea|wave|water|beach|lake)\b/.test(lower);
  const isCity = /\b(city|cyber|cyberpunk|neon|skyline|building|future|futuristic|street)\b/.test(lower);
  const isForest = /\b(forest|tree|trees|nature|jungle|wood|pine)\b/.test(lower);
  const isMountain = /\b(mountain|mountains|peak|hill|ridge|obsidian)\b/.test(lower) || isSunset;

  const hueA = isSunset ? 28 + (hash % 24) : isOcean ? 205 + (hash % 30) : isForest ? 155 + (hash % 30) : 254 + (hash % 38);
  const hueB = isSunset ? 285 + (hash % 30) : isCity ? 315 + (hash % 30) : 220 + ((hash >> 4) % 45);
  const safeLabel = prompt
    .replace(/[<>&"']/g, '')
    .trim()
    .slice(0, 44);

  const stars = Array.from({ length: 34 }, (_, i) => {
    const sx = ((hash * (i + 3) * 73) % (width - 40)) + 20;
    const sy = ((hash * (i + 7) * 53) % Math.round(height * 0.7)) + 16;
    const r = (1 + ((hash + i) % 3) * 0.9).toFixed(1);
    const op = (0.35 + ((i * 7) % 6) * 0.1).toFixed(2);
    return `<circle cx="${sx}" cy="${sy}" r="${r}" fill="#F3E8FF" opacity="${op}" />`;
  }).join('');

  let foregroundLayer = '';

  if (isCity) {
    const buildingCount = 11;
    const step = width / buildingCount;
    const towers = Array.from({ length: buildingCount }, (_, i) => {
      const bw = Math.round(step * (0.78 + ((hash + i) % 3) * 0.1));
      const bh = Math.round(height * (0.22 + (((hash >> i) + i * 17) % 32) / 100));
      const bx = Math.round(i * step);
      const by = height - bh;
      const winColor = i % 2 === 0 ? '#A78BFA' : '#38BDF8';
      const windows = Array.from({ length: 5 }, (__, row) =>
        `<rect x="${bx + 10}" y="${by + 16 + row * 22}" width="${Math.max(8, bw - 20)}" height="6" rx="2" fill="${winColor}" opacity="${0.35 + ((row + i) % 3) * 0.22}" />`
      ).join('');
      return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#0E091D" stroke="#4C1D95" stroke-opacity="0.45" />${windows}`;
    }).join('');
    foregroundLayer = towers;
  } else if (isOcean) {
    const y1 = Math.round(height * 0.64);
    const y2 = Math.round(height * 0.74);
    const y3 = Math.round(height * 0.85);
    foregroundLayer = `
      <path d="M0 ${y1} Q ${Math.round(width * 0.25)} ${y1 - 36}, ${Math.round(width * 0.5)} ${y1} T ${width} ${y1} L ${width} ${height} L 0 ${height} Z" fill="#1E1B4B" opacity="0.88" />
      <path d="M0 ${y2} Q ${Math.round(width * 0.25)} ${y2 + 32}, ${Math.round(width * 0.5)} ${y2} T ${width} ${y2} L ${width} ${height} L 0 ${height} Z" fill="#312E81" opacity="0.82" />
      <path d="M0 ${y3} Q ${Math.round(width * 0.3)} ${y3 - 26}, ${Math.round(width * 0.6)} ${y3} T ${width} ${y3} L ${width} ${height} L 0 ${height} Z" fill="#0F172A" opacity="0.96" />
    `;
  } else if (isForest) {
    const treeCount = 12;
    const step = width / treeCount;
    const trees = Array.from({ length: treeCount }, (_, i) => {
      const tx = Math.round(i * step + step * 0.5);
      const th = Math.round(height * (0.2 + ((hash + i * 19) % 18) / 100));
      const tw = Math.round(step * 0.9);
      const baseY = height;
      return `<polygon points="${tx},${baseY - th} ${tx - tw},${baseY} ${tx + tw},${baseY}" fill="#052E16" opacity="0.92" />`;
    }).join('');
    foregroundLayer = `<rect x="0" y="${Math.round(height * 0.78)}" width="${width}" height="${Math.round(height * 0.22)}" fill="#022C22" opacity="0.7" />${trees}`;
  } else if (isMountain) {
    foregroundLayer = `
      <path d="M0 ${Math.round(height * 0.76)} L${Math.round(width * 0.18)} ${Math.round(height * 0.58)} L${Math.round(width * 0.38)} ${Math.round(height * 0.7)} L${Math.round(width * 0.62)} ${Math.round(height * 0.53)} L${Math.round(width * 0.84)} ${Math.round(height * 0.67)} L${width} ${Math.round(height * 0.59)} L${width} ${height} L0 ${height} Z" fill="#1E103C" opacity="0.85" />
      <path d="M0 ${Math.round(height * 0.82)} L${Math.round(width * 0.26)} ${Math.round(height * 0.69)} L${Math.round(width * 0.52)} ${Math.round(height * 0.78)} L${Math.round(width * 0.77)} ${Math.round(height * 0.66)} L${width} ${Math.round(height * 0.79)} L${width} ${height} L0 ${height} Z" fill="url(#ridgeGrad)" />
    `;
  } else {
    foregroundLayer = `
      <path d="M0 ${Math.round(height * 0.8)} L${Math.round(width * 0.24)} ${Math.round(height * 0.7)} L${Math.round(width * 0.52)} ${Math.round(height * 0.77)} L${Math.round(width * 0.78)} ${Math.round(height * 0.68)} L${width} ${Math.round(height * 0.78)} L${width} ${height} L0 ${height} Z" fill="url(#ridgeGrad)" />
    `;
  }

  const centerOrb = isSunset
    ? `<circle cx="${cx}" cy="${Math.round(height * 0.48)}" r="${Math.round(radius * 1.15)}" fill="url(#sunGrad)" opacity="0.95" />`
    : `<ellipse cx="${cx}" cy="${cy}" rx="${Math.round(radius * 2.15)}" ry="${Math.round(
        radius * 0.54
      )}" transform="rotate(-14 ${cx} ${cy})" fill="none" stroke="url(#ringGrad)" stroke-width="${Math.max(
        6,
        Math.round(radius * 0.085)
      )}" opacity="0.92" />
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#planetGrad)" />
      <ellipse cx="${cx}" cy="${cy}" rx="${Math.round(radius * 1.78)}" ry="${Math.round(
        radius * 0.43
      )}" transform="rotate(-14 ${cx} ${cy})" fill="none" stroke="#818CF8" stroke-width="${Math.max(
        4,
        Math.round(radius * 0.042)
      )}" stroke-dasharray="140 28" opacity="0.84" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="hsl(${hueA}, 72%, 24%)" />
      <stop offset="55%" stop-color="hsl(${hueB}, 48%, 11%)" />
      <stop offset="100%" stop-color="#05030B" />
    </radialGradient>
    <radialGradient id="planetGrad" cx="35%" cy="32%" r="70%">
      <stop offset="0%" stop-color="#DDD6FE" />
      <stop offset="45%" stop-color="hsl(${hueA}, 85%, 56%)" />
      <stop offset="100%" stop-color="#2E1065" />
    </radialGradient>
    <linearGradient id="sunGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FDE047" />
      <stop offset="55%" stop-color="#FB7185" />
      <stop offset="100%" stop-color="#7C3AED" />
    </linearGradient>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="hsl(${hueB}, 90%, 60%)" stop-opacity="0.95" />
      <stop offset="50%" stop-color="#C4B5FD" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#1E3A8A" stop-opacity="0.55" />
    </linearGradient>
    <linearGradient id="ridgeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2E1065" stop-opacity="0.92" />
      <stop offset="100%" stop-color="#06040C" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGlow)" />
  ${stars}
  ${centerOrb}
  ${foregroundLayer}
  <text x="${cx}" y="${height - 24}" text-anchor="middle" fill="#E9D5FF" opacity="0.65" font-family="sans-serif" font-size="16">${safeLabel}</text>
</svg>`;
}

export function generateLocalCommandPasskey(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `nk_${hex}`;
}
