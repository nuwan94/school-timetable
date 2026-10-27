import type { Project } from '@/domain/project';
import type { ReportTable } from '@/domain/returns';
import { LABELS, localName, type Lang } from './labels';
import type { Row, Sheet } from './sheets';

/** Rows that fit on one page with the compact table style. */
const ROWS_PER_PAGE = { A4L: 20, A4P: 32 } as const;

/**
 * A report table as printable sheets: landscape when wide, split across
 * pages when long (totals and signatures on the last page).
 */
export function reportSheets(p: Project, t: ReportTable, opts: { lang?: Lang; sign?: boolean; meta?: string[] } = {}): Sheet[] {
  const lang = opts.lang ?? 'en';
  const L = LABELS[lang];
  const [first, ...rest] = t.columns;
  const paper = t.columns.length > 6 ? 'A4L' : 'A4P';
  const rows: Row[] = t.rows.map((r) => ({
    kind: 'row',
    head: { lines: [String(r[first!.key] ?? '')] },
    cells: rest.map((c) => ({ lines: [String(r[c.key] ?? '')] })),
  }));
  if (t.totals)
    rows.push({
      kind: 'row',
      head: { lines: [String(t.totals[first!.key] ?? '')] },
      cells: rest.map((c) => ({ lines: [String(t.totals![c.key] ?? '')] })),
    });
  const per = ROWS_PER_PAGE[paper];
  const pages = Math.max(1, Math.ceil(rows.length / per));
  return Array.from({ length: pages }, (_, i) => {
    const last = i === pages - 1;
    return {
      id: `report:${t.id}:${i}`,
      kind: 'report' as const,
      fileName: t.id,
      paper,
      lang,
      school: localName(p.institute, lang) || p.institute.name,
      title: t.title,
      subtitle: [p.institute.academicYear, p.institute.term].filter(Boolean).join(' · '),
      meta: [...(opts.meta ?? []), ...(t.note && i === 0 ? [t.note] : []), ...(pages > 1 ? [`${L.page} ${i + 1} / ${pages}`] : [])],
      draft: false,
      blocks: [
        {
          type: 'table' as const,
          corner: first?.label ?? '',
          head: rest.map((c) => c.label),
          rows: rows.slice(i * per, (i + 1) * per),
          compact: true,
        },
        ...(opts.sign && last ? [{ type: 'sign' as const, labels: [`${L.principal} — ${L.signature}`, L.date] }] : []),
      ],
    };
  });
}
