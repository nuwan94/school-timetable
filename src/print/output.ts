import { zipSync } from 'fflate';
import { getFontEmbedCSS, toJpeg, toPng } from 'html-to-image';
import { PDFDocument } from 'pdf-lib';
import { MARGIN_MM, PAPER_MM, type Paper } from './sheets';

/**
 * Sheet → file outputs (PLAN.md §9.1, spike decision): the browser renders
 * each sheet to an image, so Sinhala/Tamil shaping is identical to the
 * screen, and pdf-lib only assembles the pages. No fonts are needed on the
 * print-shop PC.
 */

const PT_PER_MM = 72 / 25.4;

export interface RenderedSheet {
  node: HTMLElement;
  paper: Paper;
  fileName: string;
}

type Progress = (done: number, total: number) => void;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Font CSS is collected once per batch (html-to-image otherwise refetches it per sheet). */
async function fontCss(node: HTMLElement): Promise<string> {
  await document.fonts.ready;
  return getFontEmbedCSS(node);
}

async function jpegBytes(node: HTMLElement, css: string, pixelRatio: number): Promise<Uint8Array> {
  const url = await toJpeg(node, { pixelRatio, quality: 0.75, backgroundColor: '#ffffff', fontEmbedCSS: css });
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

async function addPage(doc: PDFDocument, jpg: Uint8Array, paper: Paper) {
  const img = await doc.embedJpg(jpg);
  const { w, h } = PAPER_MM[paper];
  const page = doc.addPage([w * PT_PER_MM, h * PT_PER_MM]);
  const maxW = (w - 2 * MARGIN_MM) * PT_PER_MM;
  const maxH = (h - 2 * MARGIN_MM) * PT_PER_MM;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  page.drawImage(img, {
    x: MARGIN_MM * PT_PER_MM,
    y: h * PT_PER_MM - MARGIN_MM * PT_PER_MM - img.height * scale,
    width: img.width * scale,
    height: img.height * scale,
  });
}

/** One PDF, one sheet per page. 2× JPEG keeps a 110-teacher batch small enough to send. */
export async function sheetsToPdf(sheets: RenderedSheet[], onProgress?: Progress, pixelRatio = 2): Promise<Blob> {
  const doc = await PDFDocument.create();
  const css = sheets[0] ? await fontCss(sheets[0].node) : '';
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i]!;
    await addPage(doc, await jpegBytes(s.node, css, pixelRatio), s.paper);
    onProgress?.(i + 1, sheets.length);
    await tick();
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

/** A zip with one PDF per sheet (e.g. per teacher, to send each their own). */
export async function sheetsToZip(sheets: RenderedSheet[], onProgress?: Progress): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const css = sheets[0] ? await fontCss(sheets[0].node) : '';
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i]!;
    const doc = await PDFDocument.create();
    await addPage(doc, await jpegBytes(s.node, css, 2), s.paper);
    let name = `${s.fileName}.pdf`;
    for (let n = 2; files[name]; n++) name = `${s.fileName}-${n}.pdf`;
    files[name] = await doc.save();
    onProgress?.(i + 1, sheets.length);
    await tick();
  }
  // PDFs are already compressed; store them as-is.
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}

/** PNG of one sheet, for WhatsApp. */
export async function sheetToPng(node: HTMLElement): Promise<Blob> {
  const url = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', fontEmbedCSS: await fontCss(node) });
  return (await fetch(url)).blob();
}
