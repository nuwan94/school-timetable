import { renderToStaticMarkup } from 'react-dom/server';
import latin400 from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2?url';
import latin700 from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2?url';
import sinhala400 from '@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-400-normal.woff2?url';
import sinhala700 from '@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-700-normal.woff2?url';
import tamil400 from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff2?url';
import tamil700 from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-700-normal.woff2?url';
import sheetCss from './sheet.css?raw';
import type { Sheet } from './sheets';
import { SheetView } from './SheetView';

/**
 * Read-only review bundle (PLAN.md §9.4): one self-contained HTML file with
 * every sheet, fonts embedded, no scripts. Opens on any phone or PC, offline.
 */

const FONTS: [family: string, weight: number, url: string][] = [
  ['Noto Sans', 400, latin400],
  ['Noto Sans', 700, latin700],
  ['Noto Sans Sinhala', 400, sinhala400],
  ['Noto Sans Sinhala', 700, sinhala700],
  ['Noto Sans Tamil', 400, tamil400],
  ['Noto Sans Tamil', 700, tamil700],
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function dataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** The HTML text, given sheets and @font-face CSS. Pure, so it can be tested. */
export function bundleHtml(sheets: Sheet[], opts: { title: string; note: string; fontFaces: string }): string {
  const groups = new Map<string, Sheet[]>();
  for (const s of sheets) groups.set(s.kind, [...(groups.get(s.kind) ?? []), s]);
  const anchor = (s: Sheet) => `s-${s.id.replace(/[^\w-]/g, '_')}`;
  const toc = [...groups.values()]
    .map(
      (list) =>
        `<details open><summary>${esc(list[0]!.title.split(' — ')[0]!)} (${list.length})</summary><ul>${list
          .map((s) => `<li><a href="#${anchor(s)}">${esc(s.title.split(' — ')[1] ?? s.subtitle ?? s.title)}</a></li>`)
          .join('')}</ul></details>`,
    )
    .join('');
  const body = sheets
    .map((s) => `<section class="page" id="${anchor(s)}">${renderToStaticMarkup(<SheetView sheet={s} />)}</section>`)
    .join('\n');
  return `<!doctype html>
<html lang="${sheets[0]?.lang ?? 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
${opts.fontFaces}
${sheetCss}
body { margin: 0; background: #e5e7eb; font-family: 'Noto Sans', 'Noto Sans Sinhala', 'Noto Sans Tamil', sans-serif; }
.bar { position: sticky; top: 0; z-index: 2; background: #115e59; color: #fff; padding: 10px 16px; font-size: 14px; }
.bar b { font-size: 16px; }
.wrap { display: flex; gap: 16px; padding: 16px; align-items: flex-start; }
nav { position: sticky; top: 56px; width: 220px; flex: none; max-height: calc(100vh - 80px); overflow: auto; background: #fff; border-radius: 8px; padding: 8px 12px; font-size: 13px; }
nav ul { margin: 4px 0 8px; padding-left: 16px; }
nav summary { font-weight: 700; cursor: pointer; padding: 4px 0; }
nav a { color: #115e59; }
main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 16px; overflow-x: auto; }
.page { background: #fff; padding: 10mm; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
@media (max-width: 800px) { .wrap { flex-direction: column; } nav { position: static; width: auto; max-height: none; } main { align-items: flex-start; } }
@media print { .bar, nav { display: none; } .wrap { padding: 0; } .page { padding: 0; box-shadow: none; } body { background: #fff; } }
</style>
</head>
<body>
<div class="bar"><b>${esc(opts.title)}</b> · ${esc(opts.note)} · read-only copy for review</div>
<div class="wrap"><nav>${toc}</nav><main>
${body}
</main></div>
</body>
</html>`;
}

/** Builds the bundle with the app's fonts embedded as data URLs. */
export async function buildReviewBundle(sheets: Sheet[], opts: { title: string; note: string }): Promise<Blob> {
  const faces = await Promise.all(
    FONTS.map(
      async ([family, weight, url]) =>
        `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: normal; font-display: block; src: url(${await dataUrl(url)}) format('woff2'); }`,
    ),
  );
  return new Blob([bundleHtml(sheets, { ...opts, fontFaces: faces.join('\n') })], { type: 'text/html' });
}
