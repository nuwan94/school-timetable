import { strToU8, zipSync } from 'fflate';
import type { CellValue, ReportTable } from '@/domain/returns';

/**
 * Report tables as CSV or Excel (.xlsx), written locally with no library
 * beyond the zip already used for PNG bundles. Both keep Sinhala and Tamil.
 */

function matrix(t: ReportTable): CellValue[][] {
  const keys = t.columns.map((c) => c.key);
  const out: CellValue[][] = [t.columns.map((c) => c.label), ...t.rows.map((r) => keys.map((k) => r[k] ?? ''))];
  if (t.totals) out.push(keys.map((k) => t.totals![k] ?? ''));
  return out;
}

const csvCell = (v: CellValue) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 CSV with a BOM so Excel opens Unicode text correctly. */
export function tableToCsv(t: ReportTable): Blob {
  const text = matrix(t)
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  return new Blob(['﻿', text, '\r\n'], { type: 'text/csv;charset=utf-8' });
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A1-style column letters: 0 → A, 26 → AA. */
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Sheet names: max 31 characters, none of []:*?/\ */
const sheetName = (s: string) => s.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';

/** One or more tables as an .xlsx workbook (one sheet each), title on row 1, bold header, totals bold. */
export function tablesToXlsx(tables: ReportTable[]): Blob {
  const sheets = tables.map((t, si) => {
    const m = matrix(t);
    const widths = t.columns.map((_, c) => Math.min(60, Math.max(6, ...m.map((r) => String(r[c] ?? '').length + 2))));
    const rows: string[] = [`<row r="1"><c r="A1" t="inlineStr" s="2"><is><t>${xml(t.title)}</t></is></c></row>`];
    m.forEach((r, ri) => {
      const rowNo = ri + 3;
      const bold = ri === 0 || (t.totals && ri === m.length - 1);
      const cells = r
        .map((v, ci) => {
          const ref = `${colName(ci)}${rowNo}`;
          const style = bold ? ' s="1"' : '';
          if (typeof v === 'number') return `<c r="${ref}"${style}><v>${v}</v></c>`;
          if (v === '') return '';
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
        })
        .join('');
      rows.push(`<row r="${rowNo}">${cells}</row>`);
    });
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return {
      name: sheetName(tables.length > 1 ? `${si + 1} ${t.title}` : t.title),
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`,
    };
  });

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join(
        '',
      )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.body)));
  return new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** File-name friendly version of a title. */
export const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '') || 'report';
