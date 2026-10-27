import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadBlob } from '@/io/projectFile';
import { rasterPdf, sheetPng, vectorFailures, vectorPdf } from './pdfMethods';
import type { Lang } from './sample';
import { SampleSheet } from './SampleSheet';

interface Result {
  method: string;
  ms: number;
  bytes: number;
  url: string;
}

/** P0 spike: compare PDF paths for correct Sinhala/Tamil shaping. */
export function PdfSpike() {
  const [lang, setLang] = useState<Exclude<Lang, 'en'>>('si');
  const [results, setResults] = useState<Result[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => results.forEach((r) => URL.revokeObjectURL(r.url)), [results]);

  const run = async (method: string, make: () => Promise<Blob>, ext = 'pdf') => {
    setBusy(method);
    setErr(null);
    try {
      await document.fonts.ready;
      const t0 = performance.now();
      const blob = await make();
      const ms = Math.round(performance.now() - t0);
      const url = URL.createObjectURL(blob);
      setResults((rs) => [{ method: `${method} (${lang})`, ms, bytes: blob.size, url }, ...rs]);
      if (method.startsWith('B') && vectorFailures.length)
        setErr(`Vector PDF could not shape: ${[...new Set(vectorFailures)].join(', ')} (shown as [?])`);
      if (ext === 'pdf') setPreview(url);
      downloadBlob(blob, `spike-${method.replace(/\W+/g, '-').toLowerCase()}-${lang}.${ext}`);
    } catch (e) {
      setErr(`${method}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const png = async () => {
    const dataUrl = await sheetPng(sheetRef.current!);
    return (await fetch(dataUrl)).blob();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h2 className="text-lg font-semibold">PDF test: Sinhala / Tamil</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Generates the same sample timetable three ways. Check that conjuncts (ශ්‍රී, ප්‍ර, විද්‍යා) and
        vowel signs (කො, සේ, தொ, பெ, கை) look the same as on screen.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className="field w-auto" value={lang} onChange={(e) => setLang(e.target.value as 'si' | 'ta')}>
          <option value="si">සිංහල</option>
          <option value="ta">தமிழ்</option>
        </select>
        <button className="btn" disabled={!!busy} onClick={() => window.print()}>
          A. Print / Save as PDF
        </button>
        <button className="btn" disabled={!!busy} onClick={() => void run('B vector', () => vectorPdf(lang))}>
          B. Vector PDF (pdf-lib)
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => void run('C raster', () => rasterPdf(sheetRef.current!))}
        >
          C. Image PDF
        </button>
        <button className="btn" disabled={!!busy} onClick={() => void run('PNG', png, 'png')}>
          PNG for WhatsApp
        </button>
        {busy && <span className="text-sm text-slate-500">Working on {busy}…</span>}
      </div>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="label">On screen (reference)</p>
          <div className="overflow-x-auto rounded border border-slate-200 bg-white p-4 shadow-sm">
            <SampleSheet ref={sheetRef} lang={lang} />
          </div>
        </div>
        <div>
          <p className="label">Last generated PDF</p>
          {preview ? (
            <iframe title="PDF preview" src={preview} className="h-[720px] w-full rounded border border-slate-200 bg-white" />
          ) : (
            <p className="text-sm text-slate-500">Generate B or C to preview here.</p>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <table className="mt-6 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="pr-6">Output</th>
              <th className="pr-6">Time</th>
              <th className="pr-6">Size</th>
              <th />
            </tr>
          </thead>
          <tbody data-testid="spike-results">
            {results.map((r) => (
              <tr key={r.url}>
                <td className="pr-6">{r.method}</td>
                <td className="pr-6 tabular-nums">{r.ms} ms</td>
                <td className="pr-6 tabular-nums">{(r.bytes / 1024).toFixed(0)} KB</td>
                <td>
                  <button className="text-teal-700 underline" onClick={() => setPreview(r.url)}>
                    preview
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {createPortal(
        <div className="print-root">
          <SampleSheet lang={lang} />
        </div>,
        document.body,
      )}
    </div>
  );
}
