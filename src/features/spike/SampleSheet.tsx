import { forwardRef } from 'react';
import { cell, PERIODS, SAMPLE, type Lang } from './sample';

/** A4-proportioned sheet rendered by the browser (used for print and raster PDFs). */
export const SampleSheet = forwardRef<HTMLDivElement, { lang: Lang }>(function SampleSheet({ lang }, ref) {
  return (
    <div
      ref={ref}
      data-sheet={lang}
      className="bg-white text-black"
      style={{ width: '186mm', padding: '0', fontFamily: '"Noto Sans", "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif' }}
    >
      <div className="text-center">
        <div className="text-lg font-bold">{SAMPLE.school[lang]}</div>
        <div className="text-base">{SAMPLE.title[lang]}</div>
        <div className="mt-1 text-sm">{SAMPLE.teacher[lang]}</div>
      </div>
      <table className="mt-3 w-full border-collapse text-[11px]" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className="w-8 border border-black p-1" />
            {SAMPLE.days[lang].map((d) => (
              <th key={d} className="border border-black p-1 font-bold">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: PERIODS }, (_, p) => (
            <tr key={p}>
              <td className="border border-black p-1 text-center font-bold">{p + 1}</td>
              {SAMPLE.days[lang].map((_, d) => {
                const s = cell(d, p);
                return (
                  <td key={d} className="h-10 border border-black p-1 text-center align-middle">
                    {s === null ? '' : SAMPLE.subjects[lang][s]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-6 text-sm">{SAMPLE.footer[lang]}</div>
    </div>
  );
});
