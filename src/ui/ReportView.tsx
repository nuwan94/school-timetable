import { useState, type ReactNode } from 'react';
import type { Project } from '@/domain/project';
import type { ReportTable } from '@/domain/returns';
import { downloadBlob } from '@/io/projectFile';
import { fileSlug, tablesToXlsx, tableToCsv } from '@/io/tableExport';
import { sheetsToPdf } from '@/print/output';
import { reportSheets } from '@/print/reportSheets';
import { SheetRenderer } from '@/print/SheetRenderer';
import type { Sheet } from '@/print/sheets';
import '@/print/sheet.css';
import { Icon } from './Icon';

/** Export buttons for one or more tables: CSV (first table), Excel (all, one sheet each) and PDF. */
export function ExportButtons({ project, tables, pdf, label = '' }: { project: Project; tables: ReportTable[]; pdf?: Sheet[]; label?: string }) {
  const [printing, setPrinting] = useState<Sheet[] | null>(null);
  const first = tables[0];
  if (!first) return null;
  const base = `${fileSlug(project.institute.name || 'school')}-${fileSlug(label || first.title)}`;
  const tid = label ? fileSlug(label) : first.id;
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn" onClick={() => downloadBlob(tablesToXlsx(tables), `${base}.xlsx`)} data-testid={`export-xlsx-${tid}`}>
        <Icon name="download" className="h-4 w-4" /> Excel
      </button>
      {tables.length === 1 && (
        <button className="btn" onClick={() => downloadBlob(tableToCsv(first), `${base}.csv`)} data-testid={`export-csv-${tid}`}>
          <Icon name="download" className="h-4 w-4" /> CSV
        </button>
      )}
      <button
        className="btn"
        disabled={!!printing}
        onClick={() => setPrinting(pdf ?? tables.flatMap((t) => reportSheets(project, t, { sign: true })))}
        data-testid={`export-pdf-${tid}`}
      >
        <Icon name="print" className="h-4 w-4" /> {printing ? 'Making PDF…' : 'PDF'}
      </button>
      {printing && (
        <SheetRenderer
          sheets={printing}
          print={false}
          onReady={(nodes) =>
            void sheetsToPdf(nodes, () => {})
              .then((b) => downloadBlob(b, `${base}.pdf`))
              .finally(() => setPrinting(null))
          }
        />
      )}
    </div>
  );
}

/** A report table on screen: title, note, sticky header, numbers right-aligned, totals row. */
export function ReportView({ project, table, actions }: { project: Project; table: ReportTable; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid={`report-${table.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <h2 className="font-semibold">{table.title}</h2>
          {table.note && <p className="mt-0.5 max-w-3xl text-xs text-slate-500">{table.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <ExportButtons project={project} tables={[table]} />
        </div>
      </div>
      {table.rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">Nothing to show yet.</p>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                {table.columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 ${c.numeric ? 'text-right' : 'text-left'}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50/60 hover:bg-teal-50/40">
                  {table.columns.map((c) => (
                    <td key={c.key} className={`border-b border-slate-100 px-3 py-1.5 ${c.numeric ? 'text-right tabular-nums' : ''}`}>
                      {r[c.key] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {table.totals && (
              <tfoot className="sticky bottom-0 bg-teal-50 font-semibold">
                <tr>
                  {table.columns.map((c) => (
                    <td key={c.key} className={`border-t border-teal-200 px-3 py-2 ${c.numeric ? 'text-right tabular-nums' : ''}`}>
                      {table.totals![c.key] ?? ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
