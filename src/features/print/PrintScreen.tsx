import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '@/io/projectFile';
import { buildReviewBundle } from '@/print/bundle';
import type { Lang } from '@/print/labels';
import { sheetsToPdf, sheetsToZip, sheetToPng, type RenderedSheet } from '@/print/output';
import { buildSheets, SHEET_KINDS, type Sheet, type SheetKind } from '@/print/sheets';
import { SheetView } from '@/print/SheetView';
import { SheetRenderer } from '@/print/SheetRenderer';
import '@/print/sheet.css';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, PageHeader } from '@/ui/kit';

const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'si', label: 'සිංහල' },
  { value: 'ta', label: 'தமிழ்' },
];

const MM = 96 / 25.4;

type Job = { kind: 'pdf' | 'zip' | 'print' | 'png' | 'bundle'; sheets: Sheet[] };

export function PrintScreen({ onGenerate }: { onGenerate: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const version = project.versions.find((v) => v.id === project.activeVersionId);
  const [kind, setKind] = useState<SheetKind>('class');
  const lang = project.institute.printLanguage;
  const [picked, setPicked] = useState<string[] | null>(null); // null = all
  const [page, setPage] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const meta = SHEET_KINDS.find((k) => k.kind === kind)!;
  const items = useMemo(() => {
    if (meta.perItem === 'class') return [...project.classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (meta.perItem === 'teacher') return project.teachers.filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name));
    if (meta.perItem === 'room') return project.rooms;
    return [];
  }, [meta, project]);
  const sheets = useMemo(
    () => (version ? buildSheets(project, version, kind, { lang, ids: meta.perItem && picked ? picked : undefined }) : []),
    [project, version, kind, lang, picked, meta],
  );

  useEffect(() => setPage(0), [kind, picked, lang]);
  useEffect(() => setPicked(null), [kind]);

  if (!version)
    return (
      <div>
        <PageHeader title="Print & share" />
        <Empty>
          No timetable yet.{' '}
          <button className="text-teal-700 underline" onClick={onGenerate}>
            Generate one first
          </button>
          .
        </Empty>
      </div>
    );

  const current = sheets[Math.min(page, sheets.length - 1)];
  const busy = job !== null;
  const stamp = new Date().toISOString().slice(0, 10);
  const school = (project.institute.name || 'timetable').replace(/[^\p{L}\p{N}]+/gu, '-');

  const run = async (j: Job, nodes: RenderedSheet[]) => {
    try {
      const step = (d: number, t: number) => setProgress(`${d} of ${t}`);
      if (j.kind === 'pdf') downloadBlob(await sheetsToPdf(nodes, step), `${school}-${kind}-${lang}-${stamp}.pdf`);
      if (j.kind === 'zip') downloadBlob(await sheetsToZip(nodes, step), `${school}-${kind}-${lang}-${stamp}.zip`);
      if (j.kind === 'png' && nodes[0]) downloadBlob(await sheetToPng(nodes[0].node), `${nodes[0].fileName}-${lang}.png`);
      if (j.kind === 'print') {
        await document.fonts.ready;
        window.print();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setJob(null);
      setProgress('');
    }
  };

  const bundle = async () => {
    setError(null);
    setJob({ kind: 'bundle', sheets: [] });
    setProgress('building…');
    try {
      const all = SHEET_KINDS.flatMap((k) => buildSheets(project, version, k.kind, { lang }));
      const blob = await buildReviewBundle(all, { title: project.institute.name || 'Timetable', note: `${version.name} (${version.status})` });
      downloadBlob(blob, `${school}-review-${lang}-${stamp}.html`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setJob(null);
      setProgress('');
    }
  };

  const start = (kind: Job['kind'], list: Sheet[]) => {
    setError(null);
    setProgress('preparing…');
    setJob({ kind, sheets: list });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Print & share">
        Print directly, or download a PDF that prints the same at any print shop (Sinhala and Tamil included). PNG is handy for WhatsApp.
      </PageHeader>

      {version.status === 'draft' && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This timetable is still a draft, so sheets are marked DRAFT. Approve it in Edit when it is final.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Sheet">
            <div className="space-y-1" role="radiogroup" aria-label="Sheet type">
              {SHEET_KINDS.map((k) => (
                <label key={k.kind} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="sheet-kind" checked={kind === k.kind} onChange={() => setKind(k.kind)} />
                  {k.label}
                </label>
              ))}
            </div>
            <p className="label mt-4">Language</p>
            <div className="mt-1 flex gap-1">
              {LANGS.map((l) => (
                <button
                  key={l.value}
                  className={`btn px-2.5 py-1 ${lang === l.value ? 'btn-primary' : ''}`}
                  aria-pressed={lang === l.value}
                  onClick={() =>
                    update((d) => {
                      d.institute.printLanguage = l.value;
                    })
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
            {lang !== 'en' && (
              <p className="mt-1 text-xs text-slate-500">Uses the Sinhala/Tamil names entered for subjects, teachers and the school; English names fill any gaps.</p>
            )}
          </Card>

          {meta.perItem && items.length > 0 && (
            <Card
              title={`Which ${meta.perItem === 'class' ? 'classes' : meta.perItem === 'teacher' ? 'teachers' : 'rooms'}`}
              actions={
                <button className="text-xs text-teal-700 underline" onClick={() => setPicked(picked ? null : [])}>
                  {picked ? 'All' : 'Choose…'}
                </button>
              }
            >
              {!picked ? (
                <p className="text-sm text-slate-600">All {items.length}.</p>
              ) : (
                <ul className="max-h-72 space-y-0.5 overflow-y-auto text-sm">
                  {items.map((it) => (
                    <li key={it.id}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={picked.includes(it.id)}
                          onChange={(e) => setPicked(e.target.checked ? [...picked, it.id] : picked.filter((x) => x !== it.id))}
                        />
                        {it.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Output">
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary" disabled={busy || !sheets.length} onClick={() => start('pdf', sheets)} data-testid="download-pdf">
                Download PDF ({sheets.length} page{sheets.length === 1 ? '' : 's'})
              </button>
              <button className="btn" disabled={busy || !sheets.length} onClick={() => start('print', sheets)}>
                Print…
              </button>
              {meta.perItem && sheets.length > 1 && (
                <button className="btn" disabled={busy} onClick={() => start('zip', sheets)} data-testid="download-zip">
                  One PDF each (zip)
                </button>
              )}
              <button className="btn" disabled={busy || !current} onClick={() => current && start('png', [current])}>
                PNG of this page (WhatsApp)
              </button>
              <hr className="my-1 border-slate-200" />
              <button className="btn" disabled={busy} onClick={() => void bundle()} data-testid="review-bundle">
                Review bundle (one HTML file)
              </button>
              <p className="text-xs text-slate-500">Every sheet in one file that opens on any phone or PC — send it for checking before you print.</p>
              {busy && (
                <p className="text-sm text-slate-600" role="status">
                  Working… {progress}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-800">
                  {error}
                </p>
              )}
            </div>
          </Card>
        </div>

        <Card
          title={current ? current.title : 'Preview'}
          actions={
            sheets.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <button className="btn px-2 py-0.5" disabled={page <= 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
                  ‹
                </button>
                <span data-testid="page-of">
                  {Math.min(page, sheets.length - 1) + 1} / {sheets.length}
                </span>
                <button className="btn px-2 py-0.5" disabled={page >= sheets.length - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
                  ›
                </button>
              </div>
            )
          }
        >
          {current ? <Preview sheet={current} /> : <Empty>Nothing to print for this choice.</Empty>}
        </Card>
      </div>

      {job && job.kind !== 'bundle' && <SheetRenderer sheets={job.sheets} print={job.kind === 'print'} onReady={(nodes) => void run(job, nodes)} />}
    </div>
  );
}

/** Scales the real-size sheet down to fit the preview column. */
function Preview({ sheet }: { sheet: Sheet }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const s = Math.min(1, outer.current.clientWidth / (inner.current.offsetWidth + 2));
      setScale(s);
      setHeight(inner.current.offsetHeight * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [sheet]);
  return (
    <div ref={outer} className="overflow-hidden" style={{ height }} data-testid="sheet-preview">
      <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content' }} className="shadow ring-1 ring-slate-200">
        <div style={{ padding: `${10 * MM}px`, background: '#fff' }}>
          <SheetView sheet={sheet} />
        </div>
      </div>
    </div>
  );
}
