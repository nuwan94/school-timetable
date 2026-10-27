import { forwardRef } from 'react';
import { MARGIN_MM, PAPER_MM, type Block, type Cell, type Sheet } from './sheets';

/** Content box of a sheet in mm (paper minus margins). */
export const contentMm = (sheet: Pick<Sheet, 'paper'>) => ({
  w: PAPER_MM[sheet.paper].w - 2 * MARGIN_MM,
  h: PAPER_MM[sheet.paper].h - 2 * MARGIN_MM,
});

const Lines = ({ cell }: { cell: Cell }) => (
  <>
    {cell.lines.map((l, i) => (
      <div key={i} className="tt-l">
        {l}
      </div>
    ))}
  </>
);

function BlockView({ block, week }: { block: Block; week: boolean }) {
  if (block.type === 'facts')
    return (
      <div className="tt-facts">
        {block.items.map(([k, v]) => (
          <span key={k}>
            {k}:<b>{v}</b>
          </span>
        ))}
      </div>
    );
  if (block.type === 'sign')
    return (
      <div className="tt-sign">
        {block.labels.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    );
  const cols = block.head.length;
  const headW = block.compact ? (block.headGroups ? '30mm' : '22mm') : '20mm';
  return (
    <table className={`tt-table ${block.compact ? 'tt-compact' : ''} ${week ? 'tt-week' : ''}`}>
      <colgroup>
        <col style={{ width: headW }} />
        {block.head.map((_, i) => (
          <col key={i} />
        ))}
      </colgroup>
      <thead>
        {block.headGroups && (
          <tr>
            <th rowSpan={2} className="tt-rowhead">
              {block.corner}
            </th>
            {block.headGroups.map((g, i) => (
              <th key={i} colSpan={g.span}>
                {g.label}
              </th>
            ))}
          </tr>
        )}
        <tr>
          {!block.headGroups && <th className="tt-rowhead">{block.corner}</th>}
          {block.head.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((r, i) =>
          r.kind === 'band' ? (
            <tr key={i} className="tt-band">
              <td colSpan={cols + 1}>{r.label}</td>
            </tr>
          ) : (
            <tr key={i}>
              <td className="tt-rowhead">
                <Lines cell={r.head} />
              </td>
              {r.cells.map((c, j) => (
                <td key={j} className={c.muted ? 'tt-muted' : undefined}>
                  <Lines cell={c} />
                </td>
              ))}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

/** One printable page. Sized in mm to its paper's content box. */
export const SheetView = forwardRef<HTMLDivElement, { sheet: Sheet }>(function SheetView({ sheet }, ref) {
  const box = contentMm(sheet);
  return (
    <div
      ref={ref}
      className="tt-sheet"
      data-paper={sheet.paper}
      data-sheet-id={sheet.id}
      lang={sheet.lang}
      style={{ width: `${box.w}mm`, minHeight: `${box.h}mm` }}
    >
      <div className="tt-head">
        {sheet.draft && <span className="tt-draft">DRAFT</span>}
        {sheet.school && <div className="tt-school">{sheet.school}</div>}
        <div className="tt-title">{sheet.title}</div>
        {sheet.subtitle && <div className="tt-sub">{sheet.subtitle}</div>}
        {sheet.meta.length > 0 && <div className="tt-meta">{sheet.meta.join('   ·   ')}</div>}
      </div>
      {sheet.blocks.map((b, i) => (
        <BlockView key={i} block={b} week={i === 0 && (sheet.kind === 'class' || sheet.kind === 'teacher' || sheet.kind === 'room')} />
      ))}
    </div>
  );
});
