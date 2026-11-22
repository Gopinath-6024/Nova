import { jsPDF } from 'jspdf';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type {
  GeneratedPdfRecord,
  PdfContentBlock,
  PdfLayoutConfig,
  PdfMarginPreset,
} from '../types/nova';

export interface PdfBlueprint {
  title: string;
  subtitle?: string;
  author?: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
}

export const DEFAULT_PDF_LAYOUT_CONFIG: PdfLayoutConfig = {
  template: 'executive',
  pageSize: 'a4',
  orientation: 'portrait',
  fontFamily: 'helvetica',
  textAlign: 'left',
  marginPreset: 'standard',
  includePageNumbers: true,
  includeHeaderRule: true,
  accentHex: '#6D28D9',
};

const MARGIN_BY_PRESET: Record<PdfMarginPreset, number> = {
  compact: 34,
  standard: 52,
  wide: 72,
};

const CHART_PALETTE: Array<[number, number, number]> = [
  [109, 40, 217], // Violet
  [14, 165, 233], // Sky
  [16, 185, 129], // Emerald
  [245, 158, 11], // Amber
  [236, 72, 153], // Pink
  [99, 102, 241], // Indigo
  [20, 184, 166], // Teal
];

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = (hex || '#6D28D9').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [109, 40, 217];
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function downloadBase64Pdf(base64: string, fileName: string) {
  const bytes = base64ToUint8(base64);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function base64PdfToBlobUrl(base64: string): string {
  const bytes = base64ToUint8(base64);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

export async function normalizeImageDataUrl(
  rawUrl: string
): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG'; width: number; height: number } | null> {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    const isJpeg = /^data:image\/jpe?g/i.test(rawUrl);
    return {
      dataUrl: rawUrl,
      format: isJpeg ? 'JPEG' : 'PNG',
      width: 1000,
      height: 700,
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const natW = Math.max(1, img.naturalWidth || 800);
      const natH = Math.max(1, img.naturalHeight || 600);
      const isDirectJpeg = /^data:image\/jpe?g/i.test(rawUrl);
      const isDirectPng = /^data:image\/png/i.test(rawUrl);
      if (isDirectJpeg || isDirectPng) {
        resolve({
          dataUrl: rawUrl,
          format: isDirectJpeg ? 'JPEG' : 'PNG',
          width: natW,
          height: natH,
        });
        return;
      }

      try {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(natW, natH));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(natW * scale));
        canvas.height = Math.max(1, Math.round(natH * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          format: 'PNG',
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = rawUrl;
  });
}

function drawAlignedParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  align: PdfLayoutConfig['textAlign'],
  lineHeight: number
): number {
  const trimmed = text.trim();
  if (!trimmed) return y;
  const lines = doc.splitTextToSize(trimmed, maxWidth) as string[];
  if (align === 'center') {
    doc.text(lines, x + maxWidth / 2, y, { align: 'center', lineHeightFactor: 1.35 });
  } else if (align === 'right') {
    doc.text(lines, x + maxWidth, y, { align: 'right', lineHeightFactor: 1.35 });
  } else if (align === 'justify') {
    doc.text(trimmed, x, y, { maxWidth, align: 'justify' });
  } else {
    doc.text(lines, x, y);
  }
  return y + lines.length * lineHeight + 6;
}

function drawTableBlock(
  doc: jsPDF,
  block: Extract<PdfContentBlock, { kind: 'table' }>,
  marginX: number,
  contentWidth: number,
  startY: number,
  pageHeight: number,
  accentRgb: [number, number, number],
  fontFamily: PdfLayoutConfig['fontFamily'],
  ensureSpace: (needed: number) => void
): number {
  let y = startY;
  const headers = block.headers.length > 0 ? block.headers : ['Column 1', 'Column 2'];
  const colCount = headers.length;
  const colW = contentWidth / colCount;

  if (block.title.trim()) {
    ensureSpace(44);
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.text(block.title.trim(), marginX, y);
    y += 14;
  }

  const renderHeaderRow = () => {
    doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.rect(marginX, y, contentWidth, 24, 'F');
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, idx) => {
      const cellLines = doc.splitTextToSize(String(h || ''), colW - 10) as string[];
      doc.text(cellLines[0] || '', marginX + idx * colW + 6, y + 15);
    });
    y += 24;
  };

  ensureSpace(56);
  renderHeaderRow();

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.2);

  block.rows.forEach((row, rIdx) => {
    const wrappedCells = headers.map((_, cIdx) =>
      doc.splitTextToSize(String(row[cIdx] ?? ''), colW - 12) as string[]
    );
    const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
    const rowHeight = Math.max(22, maxLines * 12 + 10);

    if (y + rowHeight > pageHeight - 54) {
      doc.addPage();
      y = 54;
      renderHeaderRow();
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(9.2);
    }

    if (rIdx % 2 === 1) {
      doc.setFillColor(246, 245, 251);
      doc.rect(marginX, y, contentWidth, rowHeight, 'F');
    }
    doc.setDrawColor(222, 218, 235);
    doc.rect(marginX, y, contentWidth, rowHeight, 'S');

    doc.setTextColor(35, 32, 48);
    wrappedCells.forEach((cellLines, cIdx) => {
      if (cIdx > 0) {
        doc.line(marginX + cIdx * colW, y, marginX + cIdx * colW, y + rowHeight);
      }
      doc.text(cellLines, marginX + cIdx * colW + 6, y + 14);
    });

    y += rowHeight;
  });

  return y + 16;
}

function drawChartBlock(
  doc: jsPDF,
  block: Extract<PdfContentBlock, { kind: 'chart' }>,
  marginX: number,
  contentWidth: number,
  startY: number,
  accentRgb: [number, number, number],
  fontFamily: PdfLayoutConfig['fontFamily'],
  ensureSpace: (needed: number) => void
): number {
  const data = block.data.filter((d) => Number.isFinite(Number(d.value)));
  if (data.length === 0) return startY;

  const boxHeight = 200;
  ensureSpace(boxHeight + 28);
  let y = startY;

  // Title
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  const fullTitle = block.unitLabel
    ? `${block.title} (${block.unitLabel})`
    : block.title;
  doc.text(fullTitle, marginX, y);
  y += 10;

  // Card backdrop
  doc.setFillColor(250, 249, 253);
  doc.setDrawColor(225, 220, 238);
  doc.roundedRect(marginX, y, contentWidth, boxHeight, 6, 6, 'FD');

  const padLeft = 46;
  const padRight = 22;
  const padTop = 24;
  const padBottom = 38;
  const plotX = marginX + padLeft;
  const plotY = y + padTop;
  const plotW = Math.max(120, contentWidth - padLeft - padRight);
  const plotH = boxHeight - padTop - padBottom;
  const maxVal = Math.max(1, ...data.map((d) => Math.max(0, Number(d.value))));

  if (block.chartType === 'pie') {
    const total = Math.max(1, data.reduce((acc, d) => acc + Math.max(0, Number(d.value)), 0));
    const cx = marginX + Math.min(contentWidth * 0.34, 130);
    const cy = y + boxHeight / 2;
    const radius = Math.min(68, plotH * 0.46);
    let angle = -Math.PI / 2;

    data.forEach((item, idx) => {
      const val = Math.max(0, Number(item.value));
      const sliceAngle = (val / total) * Math.PI * 2;
      const color = CHART_PALETTE[idx % CHART_PALETTE.length];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.setDrawColor(255, 255, 255);
      const steps = Math.max(6, Math.ceil(sliceAngle / 0.14));
      for (let s = 0; s < steps; s++) {
        const a1 = angle + (sliceAngle * s) / steps;
        const a2 = angle + (sliceAngle * (s + 1)) / steps;
        doc.triangle(
          cx,
          cy,
          cx + Math.cos(a1) * radius,
          cy + Math.sin(a1) * radius,
          cx + Math.cos(a2) * radius,
          cy + Math.sin(a2) * radius,
          'F'
        );
      }
      angle += sliceAngle;

      // Legend entry
      const legX = cx + radius + 28;
      const legY = y + 30 + idx * 20;
      if (legX + 90 < marginX + contentWidth && legY < y + boxHeight - 14) {
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(legX, legY - 7, 9, 9, 'F');
        doc.setFont(fontFamily, 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(40, 35, 55);
        const pct = Math.round((val / total) * 100);
        doc.text(`${String(item.label).slice(0, 22)} (${pct}%)`, legX + 14, legY);
      }
    });
  } else {
    // Gridlines + Y ticks
    doc.setDrawColor(230, 226, 240);
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(115, 108, 138);
    for (let t = 0; t <= 4; t++) {
      const gy = plotY + (plotH * t) / 4;
      doc.line(plotX, gy, plotX + plotW, gy);
      const tickVal = Math.round(maxVal * (1 - t / 4));
      doc.text(String(tickVal), plotX - 6, gy + 3, { align: 'right' });
    }
    doc.setDrawColor(160, 152, 185);
    doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

    const stepW = plotW / data.length;
    if (block.chartType === 'bar') {
      const barW = Math.min(36, Math.max(12, stepW * 0.56));
      data.forEach((item, idx) => {
        const val = Math.max(0, Number(item.value));
        const barH = (val / maxVal) * plotH;
        const bx = plotX + idx * stepW + (stepW - barW) / 2;
        const by = plotY + plotH - barH;
        const color = idx === 0 ? accentRgb : CHART_PALETTE[idx % CHART_PALETTE.length];
        doc.setFillColor(color[0], color[1], color[2]);
        doc.roundedRect(bx, by, barW, Math.max(2, barH), 2, 2, 'F');

        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(45, 38, 65);
        doc.text(String(val), bx + barW / 2, Math.max(plotY + 8, by - 4), { align: 'center' });

        doc.setFont(fontFamily, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(82, 76, 104);
        doc.text(String(item.label).slice(0, 11), bx + barW / 2, plotY + plotH + 14, {
          align: 'center',
        });
      });
    } else {
      // Line chart
      doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2]);
      doc.setLineWidth(2);
      const pts = data.map((item, idx) => {
        const val = Math.max(0, Number(item.value));
        return {
          x: plotX + idx * stepW + stepW / 2,
          y: plotY + plotH - (val / maxVal) * plotH,
          val,
          label: String(item.label).slice(0, 11),
        };
      });
      for (let i = 0; i < pts.length - 1; i++) {
        doc.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      }
      doc.setLineWidth(0.75);
      pts.forEach((pt) => {
        doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.circle(pt.x, pt.y, 3.5, 'F');
        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(45, 38, 65);
        doc.text(String(pt.val), pt.x, Math.max(plotY + 8, pt.y - 7), { align: 'center' });
        doc.setFont(fontFamily, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(82, 76, 104);
        doc.text(pt.label, pt.x, plotY + plotH + 14, { align: 'center' });
      });
    }
  }

  return y + boxHeight + 18;
}

export async function createRichPdfAsync(options: {
  title: string;
  subtitle?: string;
  author?: string;
  blocks: PdfContentBlock[];
  config?: Partial<PdfLayoutConfig>;
}): Promise<GeneratedPdfRecord> {
  const cfg: PdfLayoutConfig = {
    ...DEFAULT_PDF_LAYOUT_CONFIG,
    ...(options.config ?? {}),
  };

  const doc = new jsPDF({
    unit: 'pt',
    format: cfg.pageSize,
    orientation: cfg.orientation,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = MARGIN_BY_PRESET[cfg.marginPreset] ?? 52;
  const contentWidth = pageWidth - marginX * 2;
  const accentRgb = hexToRgbTuple(cfg.accentHex);
  const font = cfg.fontFamily;
  let y = marginX + 12;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 54) {
      doc.addPage();
      y = marginX;
    }
  };

  // Template Header Variations
  if (cfg.template === 'executive') {
    doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.rect(marginX, y - 16, 52, 4, 'F');
  } else if (cfg.template === 'portfolio') {
    doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.rect(0, 0, pageWidth, 14, 'F');
  }

  const titleX =
    cfg.textAlign === 'center'
      ? marginX + contentWidth / 2
      : cfg.textAlign === 'right'
      ? marginX + contentWidth
      : marginX;
  const headerTextOpts =
    cfg.textAlign === 'center' || cfg.textAlign === 'right'
      ? { align: cfg.textAlign }
      : undefined;

  doc.setFont(font, 'bold');
  doc.setFontSize(cfg.template === 'academic' ? 18 : 22);
  doc.setTextColor(22, 16, 38);
  const titleLines = doc.splitTextToSize(options.title || 'NOVA Document', contentWidth) as string[];
  doc.text(titleLines, titleX, y + 6, headerTextOpts);
  y += titleLines.length * 25 + 6;

  if (options.subtitle?.trim()) {
    doc.setFont(font, cfg.template === 'academic' ? 'italic' : 'normal');
    doc.setFontSize(11.5);
    doc.setTextColor(92, 82, 118);
    const subLines = doc.splitTextToSize(options.subtitle.trim(), contentWidth) as string[];
    doc.text(subLines, titleX, y, headerTextOpts);
    y += subLines.length * 16 + 8;
  }

  doc.setFont(font, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(125, 118, 145);
  doc.text(
    `${options.author || 'Prepared in NOVA PDF Studio'} · ${new Date().toLocaleDateString()}`,
    titleX,
    y,
    headerTextOpts
  );
  y += 14;

  if (cfg.includeHeaderRule) {
    doc.setDrawColor(225, 220, 238);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 22;
  } else {
    y += 12;
  }

  // Normalize all image blocks up front asynchronously
  const imageCache = new Map<
    string,
    { dataUrl: string; format: 'PNG' | 'JPEG'; width: number; height: number } | null
  >();
  for (const block of options.blocks) {
    if (block.kind === 'image' && block.dataUrl) {
      imageCache.set(block.id, await normalizeImageDataUrl(block.dataUrl));
    }
  }

  for (const block of options.blocks) {
    if (block.kind === 'section') {
      ensureSpace(48);
      if (block.heading.trim()) {
        doc.setFont(font, 'bold');
        doc.setFontSize(13.5);
        doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        const headingLines = doc.splitTextToSize(block.heading.trim(), contentWidth) as string[];
        doc.text(headingLines, marginX, y);
        y += headingLines.length * 17 + 6;
      }

      doc.setFont(font, 'normal');
      doc.setFontSize(10.8);
      doc.setTextColor(35, 32, 48);

      for (const para of block.paragraphs) {
        if (!para.trim()) continue;
        const estLines = (doc.splitTextToSize(para.trim(), contentWidth) as string[]).length;
        ensureSpace(estLines * 15 + 10);
        y = drawAlignedParagraph(doc, para, marginX, y, contentWidth, cfg.textAlign, 15.5);
      }

      if (block.bullets && block.bullets.length > 0) {
        for (const bullet of block.bullets) {
          if (!bullet.trim()) continue;
          const bLines = doc.splitTextToSize(`•  ${bullet.trim()}`, contentWidth - 14) as string[];
          ensureSpace(bLines.length * 14.5 + 6);
          doc.text(bLines, marginX + 10, y);
          y += bLines.length * 14.5 + 4;
        }
        y += 6;
      }
      y += 8;
    } else if (block.kind === 'image') {
      const normalized = imageCache.get(block.id);
      if (!normalized) continue;

      const targetW = contentWidth * (block.widthPercent / 100);
      const ratio = normalized.height / Math.max(1, normalized.width);
      const maxSinglePageImgH = pageHeight - marginX * 2 - 70;
      let drawW = targetW;
      let drawH = drawW * ratio;
      if (drawH > maxSinglePageImgH) {
        drawH = maxSinglePageImgH;
        drawW = drawH / Math.max(0.01, ratio);
      }

      ensureSpace(drawH + 38);
      const drawX =
        block.align === 'center'
          ? marginX + (contentWidth - drawW) / 2
          : block.align === 'right'
          ? marginX + (contentWidth - drawW)
          : marginX;

      doc.setDrawColor(220, 215, 234);
      doc.rect(drawX - 1, y - 1, drawW + 2, drawH + 2, 'S');
      doc.addImage(normalized.dataUrl, normalized.format, drawX, y, drawW, drawH);
      y += drawH + 12;

      const captionParts = [block.caption?.trim(), block.attribution?.trim()].filter(Boolean);
      if (captionParts.length > 0) {
        doc.setFont(font, 'italic');
        doc.setFontSize(8.8);
        doc.setTextColor(100, 94, 122);
        const capLines = doc.splitTextToSize(captionParts.join(' · '), contentWidth) as string[];
        doc.text(capLines, drawX, y);
        y += capLines.length * 12 + 8;
      } else {
        y += 6;
      }
    } else if (block.kind === 'table') {
      y = drawTableBlock(
        doc,
        block,
        marginX,
        contentWidth,
        y,
        pageHeight,
        accentRgb,
        font,
        ensureSpace
      );
    } else if (block.kind === 'chart') {
      y = drawChartBlock(doc, block, marginX, contentWidth, y, accentRgb, font, ensureSpace);
    }
  }

  const totalPages = doc.getNumberOfPages();
  if (cfg.includePageNumbers) {
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont(font, 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(140, 134, 160);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 26, {
        align: 'right',
      });
    }
  }

  const arrayBuffer = doc.output('arraybuffer');
  const base64Data = uint8ToBase64(new Uint8Array(arrayBuffer));

  const legacySections = options.blocks
    .filter((b): b is Extract<PdfContentBlock, { kind: 'section' }> => b.kind === 'section')
    .map((s) => ({
      heading: s.heading,
      paragraphs: s.paragraphs,
      bullets: s.bullets,
    }));

  return {
    id: `pdf-${Date.now()}`,
    title: options.title || 'NOVA Document',
    subtitle: options.subtitle || `${totalPages} pages`,
    pageCount: totalPages,
    base64Data,
    sections: legacySections,
    blocks: options.blocks,
    layoutConfig: cfg,
    updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

export function createFormattedPdf(blueprint: PdfBlueprint): GeneratedPdfRecord {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 52;
  const contentWidth = pageWidth - marginX * 2;
  let y = 64;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 58) {
      doc.addPage();
      y = 58;
    }
  };

  doc.setFillColor(109, 40, 217);
  doc.rect(marginX, y - 18, 48, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(22, 16, 38);
  const titleLines = doc.splitTextToSize(blueprint.title || 'Nova Document', contentWidth);
  doc.text(titleLines, marginX, y + 6);
  y += titleLines.length * 26 + 6;

  if (blueprint.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11.5);
    doc.setTextColor(92, 82, 118);
    const subLines = doc.splitTextToSize(blueprint.subtitle, contentWidth);
    doc.text(subLines, marginX, y);
    y += subLines.length * 16 + 8;
  }

  doc.setFontSize(9.5);
  doc.setTextColor(125, 118, 145);
  doc.text(
    `${blueprint.author || 'Prepared by Nova'} · ${new Date().toLocaleDateString()}`,
    marginX,
    y
  );
  y += 16;

  doc.setDrawColor(225, 220, 238);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  for (const section of blueprint.sections) {
    ensureSpace(56);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(76, 29, 149);
    const headingLines = doc.splitTextToSize(section.heading, contentWidth);
    doc.text(headingLines, marginX, y);
    y += headingLines.length * 18 + 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(35, 32, 48);

    for (const para of section.paragraphs) {
      const lines = doc.splitTextToSize(para, contentWidth);
      ensureSpace(lines.length * 16 + 10);
      doc.text(lines, marginX, y);
      y += lines.length * 16 + 8;
    }

    if (section.bullets && section.bullets.length > 0) {
      for (const b of section.bullets) {
        const bLines = doc.splitTextToSize(`•  ${b}`, contentWidth - 14);
        ensureSpace(bLines.length * 15 + 6);
        doc.text(bLines, marginX + 10, y);
        y += bLines.length * 15 + 4;
      }
      y += 6;
    }

    y += 8;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140, 134, 160);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX - 52, pageHeight - 28);
  }

  const arrayBuffer = doc.output('arraybuffer');
  const base64Data = uint8ToBase64(new Uint8Array(arrayBuffer));

  const blocks: PdfContentBlock[] = blueprint.sections.map((s, idx) => ({
    id: `sec-${Date.now()}-${idx}`,
    kind: 'section',
    heading: s.heading,
    paragraphs: s.paragraphs,
    bullets: s.bullets ?? [],
  }));

  return {
    id: `pdf-${Date.now()}`,
    title: blueprint.title || 'Nova Document',
    subtitle: blueprint.subtitle || `${totalPages} pages`,
    pageCount: totalPages,
    base64Data,
    sections: blueprint.sections,
    blocks,
    layoutConfig: DEFAULT_PDF_LAYOUT_CONFIG,
    updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

export async function modifyExistingPdf(options: {
  base64Data: string;
  newTitle?: string;
  watermarkText?: string;
  appendHeading?: string;
  appendBody?: string;
  overlayNote?: { pageIndex: number; text: string };
  deletePageIndexes?: number[];
}): Promise<{ base64Data: string; pageCount: number }> {
  const bytes = base64ToUint8(options.base64Data);
  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  if (options.newTitle?.trim()) {
    pdfDoc.setTitle(options.newTitle.trim());
  }

  if (options.deletePageIndexes && options.deletePageIndexes.length > 0) {
    const sorted = [...new Set(options.deletePageIndexes)]
      .filter((idx) => idx >= 0 && idx < pdfDoc.getPageCount())
      .sort((a, b) => b - a);
    for (const idx of sorted) {
      if (pdfDoc.getPageCount() > 1) {
        pdfDoc.removePage(idx);
      }
    }
  }

  if (options.watermarkText?.trim()) {
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawText(options.watermarkText.trim(), {
        x: width * 0.22,
        y: height * 0.45,
        size: 38,
        font: boldFont,
        color: rgb(0.45, 0.28, 0.85),
        opacity: 0.16,
        rotate: degrees(32),
      });
    }
  }

  if (options.overlayNote?.text?.trim()) {
    const idx = Math.max(0, Math.min(pdfDoc.getPageCount() - 1, options.overlayNote.pageIndex));
    const page = pdfDoc.getPage(idx);
    const { width } = page.getSize();
    const noteText = options.overlayNote.text.trim().slice(0, 180);
    page.drawRectangle({
      x: 40,
      y: 36,
      width: Math.max(200, width - 80),
      height: 36,
      color: rgb(0.95, 0.93, 1),
      borderColor: rgb(0.45, 0.24, 0.88),
      borderWidth: 1,
    });
    page.drawText(noteText, {
      x: 52,
      y: 50,
      size: 10,
      font,
      color: rgb(0.18, 0.12, 0.35),
    });
  }

  if (options.appendBody?.trim()) {
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { height } = page.getSize();
    let y = height - 64;

    if (options.appendHeading?.trim()) {
      page.drawText(options.appendHeading.trim(), {
        x: 52,
        y,
        size: 16,
        font: boldFont,
        color: rgb(0.35, 0.15, 0.65),
      });
      y -= 28;
    }

    const words = options.appendBody.trim().split(/\s+/);
    let line = '';
    const maxChars = 78;
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxChars) {
        if (y < 54) break;
        page.drawText(line.trim(), {
          x: 52,
          y,
          size: 11,
          font,
          color: rgb(0.14, 0.13, 0.18),
        });
        y -= 17;
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    if (line && y >= 54) {
      page.drawText(line, {
        x: 52,
        y,
        size: 11,
        font,
        color: rgb(0.14, 0.13, 0.18),
      });
    }
    page.drawText('Updated via Nova PDF Studio', {
      x: 52,
      y: 28,
      size: 8.5,
      font,
      color: rgb(0.55, 0.5, 0.65),
    });
  }

  const outBytes = await pdfDoc.save();
  return {
    base64Data: uint8ToBase64(outBytes),
    pageCount: pdfDoc.getPageCount(),
  };
}
