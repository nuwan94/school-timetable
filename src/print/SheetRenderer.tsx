import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { RenderedSheet } from './output';
import type { Sheet } from './sheets';
import { SheetView } from './SheetView';

/**
 * Renders sheets at real size: off-screen for image outputs (PDF/PNG), or
 * into the print-only root for the browser's Print. Calls back once laid out.
 */
export function SheetRenderer({
  sheets,
  print,
  fit = false,
  onReady,
}: {
  sheets: Sheet[];
  print: boolean;
  /** Crop to content (phone images). */
  fit?: boolean;
  onReady: (nodes: RenderedSheet[]) => void;
}) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // Two frames: let layout and web fonts settle before capture.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        onReady(sheets.map((s, i) => ({ node: refs.current[i]!, paper: s.paper, fileName: s.fileName })).filter((n) => !!n.node)),
      ),
    );
  }, [sheets, onReady]);
  const content = sheets.map((s, i) => (
    <SheetView
      key={s.id}
      sheet={s}
      fit={fit}
      ref={(el) => {
        refs.current[i] = el;
      }}
    />
  ));
  if (print) return createPortal(<div className="print-root">{content}</div>, document.body);
  return (
    <div aria-hidden style={{ position: 'fixed', left: -100_000, top: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {content}
    </div>
  );
}
