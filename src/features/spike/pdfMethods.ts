// @pdf-lib/fontkit's Indic shaper is Babel-compiled and expects a global regeneratorRuntime.
import 'regenerator-runtime/runtime';
import fontkit from '@pdf-lib/fontkit';
import { toPng } from 'html-to-image';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import latinUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import sinhalaUrl from '@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-400-normal.woff?url';
import tamilUrl from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff?url';
import { cell, PERIODS, SAMPLE, type Lang } from './sample';

/**
 * PDF spike: three ways to get a Sinhala/Tamil timetable into a PDF.
 *  A. Browser print engine (window.print → "Save as PDF")  — see PdfSpike.tsx
 *  B. Vector PDF via pdf-lib + fontkit with embedded Noto fonts
 *  C. Raster PDF: browser renders the sheet → PNG (html-to-image) → pdf-lib page
 */

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 34; // ≈12 mm

async function bytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font load failed: ${url}`);
  return res.arrayBuffer();
}

// ------------------------------------------------------------------ B. vector

const SCRIPT = /[඀-෿஀-௿‌‍]/;

/** Split text into runs so non-Sinhala/Tamil characters (digits, Latin) use the Latin font. */
function runs(text: string): { text: string; script: boolean }[] {
  const out: { text: string; script: boolean }[] = [];
  for (const ch of text) {
    const script = SCRIPT.test(ch) || (ch === ' ' && out.length > 0 && out[out.length - 1]!.script);
    const last = out[out.length - 1];
    if (last && last.script === script) last.text += ch;
    else out.push({ text: ch, script });
  }
  return out;
}

interface Fonts {
  latin: PDFFont;
  script: PDFFont;
}

/**
 * Spike finding: @pdf-lib/fontkit 1.1.1 throws inside its shaper for Sinhala
 * words ending in the split vowel signs ේ / ෝ (e.g. "කේ", "කළේ"). Such runs
 * are replaced with a visible marker and recorded so the spike can report them.
 */
export const vectorFailures: string[] = [];
const FAIL_MARK = '[?]';

function safeRun(r: { text: string; script: boolean }, size: number, f: Fonts) {
  const font = r.script ? f.script : f.latin;
  try {
    return { text: r.text, font, width: font.widthOfTextAtSize(r.text, size) };
  } catch {
    vectorFailures.push(r.text);
    return { text: FAIL_MARK, font: f.latin, width: f.latin.widthOfTextAtSize(FAIL_MARK, size) };
  }
}

function textWidth(text: string, size: number, f: Fonts): number {
  return runs(text).reduce((w, r) => w + safeRun(r, size, f).width, 0);
}

function drawMixed(page: PDFPage, text: string, x: number, y: number, size: number, f: Fonts) {
  let cx = x;
  for (const r of runs(text)) {
    const run = safeRun(r, size, f);
    page.drawText(run.text, { x: cx, y, size, font: run.font, color: rgb(0, 0, 0) });
    cx += run.width;
  }
}

function drawCentered(page: PDFPage, text: string, cx: number, y: number, size: number, f: Fonts, maxW?: number) {
  let s = size;
  while (maxW && s > 5 && textWidth(text, s, f) > maxW) s -= 0.5;
  drawMixed(page, text, cx - textWidth(text, s, f) / 2, y, s, f);
}

export async function vectorPdf(lang: Exclude<Lang, 'en'>, subset = false): Promise<Blob> {
  vectorFailures.length = 0;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    latin: await doc.embedFont(await bytes(latinUrl), { subset }),
    script: await doc.embedFont(await bytes(lang === 'si' ? sinhalaUrl : tamilUrl), { subset }),
  };
  const page = doc.addPage([A4.w, A4.h]);
  const mid = A4.w / 2;
  let y = A4.h - MARGIN - 14;
  drawCentered(page, SAMPLE.school[lang], mid, y, 15, fonts);
  y -= 20;
  drawCentered(page, SAMPLE.title[lang], mid, y, 12, fonts);
  y -= 16;
  drawCentered(page, SAMPLE.teacher[lang], mid, y, 10, fonts);
  y -= 16;

  const tableW = A4.w - 2 * MARGIN;
  const firstCol = 24;
  const colW = (tableW - firstCol) / 5;
  const rowH = 30;
  const top = y;
  const rows = PERIODS + 1;
  const line = { thickness: 0.6, color: rgb(0, 0, 0) };
  for (let r = 0; r <= rows; r++)
    page.drawLine({ start: { x: MARGIN, y: top - r * rowH }, end: { x: MARGIN + tableW, y: top - r * rowH }, ...line });
  for (let c = 0; c <= 6; c++) {
    const x = c === 0 ? MARGIN : MARGIN + firstCol + (c - 1) * colW;
    page.drawLine({ start: { x, y: top }, end: { x, y: top - rows * rowH }, ...line });
  }
  const cellText = (text: string, col: number, row: number, size: number) => {
    const cx = col === 0 ? MARGIN + firstCol / 2 : MARGIN + firstCol + (col - 1) * colW + colW / 2;
    const cy = top - row * rowH - rowH / 2 - size / 3;
    drawCentered(page, text, cx, cy, size, fonts, (col === 0 ? firstCol : colW) - 6);
  };
  SAMPLE.days[lang].forEach((d, i) => cellText(d, i + 1, 0, 9));
  for (let p = 0; p < PERIODS; p++) {
    cellText(String(p + 1), 0, p + 1, 9);
    for (let d = 0; d < 5; d++) {
      const s = cell(d, p);
      if (s !== null) cellText(SAMPLE.subjects[lang][s] ?? '', d + 1, p + 1, 8.5);
    }
  }
  drawMixed(page, SAMPLE.footer[lang], MARGIN, top - rows * rowH - 30, 10, fonts);
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

// ------------------------------------------------------------------ C. raster

export async function rasterPdf(node: HTMLElement, pixelRatio = 3): Promise<Blob> {
  const png = await toPng(node, { pixelRatio, backgroundColor: '#ffffff', cacheBust: true });
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  const page = doc.addPage([A4.w, A4.h]);
  const maxW = A4.w - 2 * MARGIN;
  const scale = maxW / img.width;
  const h = img.height * scale;
  page.drawImage(img, { x: MARGIN, y: A4.h - MARGIN - h, width: maxW, height: h });
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

export async function sheetPng(node: HTMLElement, pixelRatio = 2): Promise<string> {
  return toPng(node, { pixelRatio, backgroundColor: '#ffffff' });
}
