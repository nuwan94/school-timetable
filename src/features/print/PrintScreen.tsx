import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '@/io/projectFile';
import { diffVersion } from '@/domain/midyear';
import { buildReviewBundle } from '@/print/bundle';
import type { Lang } from '@/print/labels';
import { sheetsToPdf, sheetsToZip, sheetToPng, type RenderedSheet } from '@/print/output';
import { buildSheets, SHEET_KINDS, type Sheet, type SheetKind } from '@/print/sheets';
import { SheetView } from '@/print/SheetView';
import { SheetRenderer } from '@/print/SheetRenderer';
import '@/print/sheet.css';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, PageHeader } from '@/ui/kit';
import { tx } from '@/i18n';
import { Rich } from '@/i18n/Rich';

const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', get label() { return tx('English'); } },
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
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [page, setPage] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Mid-year versions remember the lessons they replaced: offer only the sheets that changed.
  const diff = useMemo(() => (version?.baseSnapshot.length ? diffVersion(project, version) : null), [project, version]);
  const kinds = SHEET_KINDS.filter((k) => (k.kind !== 'changeNotice' || diff) && (!k.students || project.students.length > 0));
  const meta = kinds.find((k) => k.kind === kind) ?? kinds[0]!;
  const changedIds = useMemo(() => {
    if (!diff) return null;
    if (meta.perItem === 'class') return [...diff.classes];
    if (meta.perItem === 'teacher') return [...diff.teachers.keys()];
    if (meta.perItem === 'room') return [...diff.rooms];
    return null;
  }, [diff, meta]);
  const filterChanged = (onlyChanged || meta.kind === 'changeNotice') && changedIds;
  const items = useMemo(() => {
    const keep = <T extends { id: string }>(list: T[]) => (filterChanged ? list.filter((x) => changedIds!.includes(x.id)) : list);
    if (meta.perItem === 'class') return keep([...project.classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    if (meta.perItem === 'teacher') return keep(project.teachers.filter((t) => t.active || meta.kind === 'changeNotice').sort((a, b) => a.name.localeCompare(b.name)));
    if (meta.perItem === 'room') return keep(project.rooms);
    if (meta.perItem === 'student') {
      const form = (id: string) => project.classes.find((c) => c.id === id)?.name ?? '';
      return project.students
        .filter((s) => s.active)
        .map((s) => ({ id: s.id, name: `${form(s.classId)} · ${s.name}` }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }
    return [];
  }, [meta, project, filterChanged, changedIds]);
  const sheets = useMemo(() => {
    if (!version) return [];
    const ids = meta.perItem ? (picked ?? (filterChanged ? items.map((x) => x.id) : undefined)) : undefined;
    return buildSheets(project, version, meta.kind, { lang, ids });
  }, [project, version, meta, lang, picked, filterChanged, items]);

  useEffect(() => setPage(0), [kind, picked, lang]);
  useEffect(() => setPicked(null), [kind, onlyChanged]);

  if (!version)
    return (
      <div>
        <PageHeader title={tx('Print & share')} />
        <Empty>
          <Rich
            text={tx('No timetable yet. <link>Generate one first</link>.')}
            tags={{ link: (c) => <button className="text-teal-700 underline" onClick={onGenerate}>{c}</button> }}
          />
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
      if (j.kind === 'pdf') downloadBlob(await sheetsToPdf(nodes, step), `${school}-${meta.kind}-${lang}-${stamp}.pdf`);
      if (j.kind === 'zip') downloadBlob(await sheetsToZip(nodes, step), `${school}-${meta.kind}-${lang}-${stamp}.zip`);
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
      const all = kinds.flatMap((k) => buildSheets(project, version, k.kind, { lang }));
      const blob = await buildReviewBundle(all, { title: project.institute.name || tx('Timetable'), note: `${version.name} (${version.status})` });
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
      <PageHeader title={tx('Print & share')}>
        {tx('Print directly, or download a PDF that prints the same at any print shop (Sinhala and Tamil included). PNG is handy for WhatsApp.')}
      </PageHeader>

      {version.status === 'draft' && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {tx('This timetable is still a draft, so sheets are marked DRAFT. Approve it in Edit when it is final.')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title={tx('Sheet')}>
            <div className="space-y-1" role="radiogroup" aria-label={tx('Sheet type')}>
              {kinds.map((k) => (
                <label key={k.kind} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="sheet-kind" checked={meta.kind === k.kind} onChange={() => setKind(k.kind)} />
                  {k.label}
                </label>
              ))}
            </div>
            {diff && meta.perItem && meta.kind !== 'changeNotice' && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} data-testid="only-changed" />
                {tx('Only sheets that changed ({n})', { n: changedIds?.length ?? 0 })}
              </label>
            )}
            <p className="label mt-4">{tx('Language')}</p>
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
              <p className="mt-1 text-xs text-slate-500">{tx('Uses the Sinhala/Tamil names entered for subjects, teachers and the school; English names fill any gaps.')}</p>
            )}
          </Card>

          {meta.perItem && items.length > 0 && (
            <Card
              title={{ class: tx('Which classes'), teacher: tx('Which teachers'), room: tx('Which rooms'), student: tx('Which students') }[meta.perItem]}
              actions={
                <button className="text-xs text-teal-700 underline" onClick={() => setPicked(picked ? null : [])}>
                  {picked ? tx('All') : tx('Choose…')}
                </button>
              }
            >
              {!picked ? (
                <p className="text-sm text-slate-600">{tx('All {items}.', { items: items.length })}</p>
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

          <Card title={tx('Output')}>
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary" disabled={busy || !sheets.length} onClick={() => start('pdf', sheets)} data-testid="download-pdf">
                {sheets.length === 1 ? tx('Download PDF (1 page)') : tx('Download PDF ({n} pages)', { n: sheets.length })}
              </button>
              <button className="btn" disabled={busy || !sheets.length} onClick={() => start('print', sheets)}>
                {tx('Print…')}
              </button>
              {meta.perItem && sheets.length > 1 && (
                <button className="btn" disabled={busy} onClick={() => start('zip', sheets)} data-testid="download-zip">
                  {tx('One PDF each (zip)')}
                </button>
              )}
              <button className="btn" disabled={busy || !current} onClick={() => current && start('png', [current])}>
                {tx('PNG of this page (WhatsApp)')}
              </button>
              <hr className="my-1 border-slate-200" />
              <button className="btn" disabled={busy} onClick={() => void bundle()} data-testid="review-bundle">
                {tx('Review bundle (one HTML file)')}
              </button>
              <p className="text-xs text-slate-500">{tx('Every sheet in one file that opens on any phone or PC — send it for checking before you print.')}</p>
              {busy && (
                <p className="text-sm text-slate-600" role="status">
                  {tx('Working… {progress}', { progress })}
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
          title={current ? current.title : tx('Preview')}
          actions={
            sheets.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <button className="btn px-2 py-0.5" disabled={page <= 0} onClick={() => setPage(page - 1)} aria-label={tx('Previous page')}>
                  ‹
                </button>
                <span data-testid="page-of">
                  {Math.min(page, sheets.length - 1) + 1} / {sheets.length}
                </span>
                <button className="btn px-2 py-0.5" disabled={page >= sheets.length - 1} onClick={() => setPage(page + 1)} aria-label={tx('Next page')}>
                  ›
                </button>
              </div>
            )
          }
        >
          {current ? <Preview sheet={current} /> : <Empty>{tx('Nothing to print for this choice.')}</Empty>}
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
