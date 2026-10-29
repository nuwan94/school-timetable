import { Fragment, type ReactNode } from 'react';

const BASIC: Record<string, (children: ReactNode) => ReactNode> = {
  b: (c) => <b>{c}</b>,
  strong: (c) => <strong>{c}</strong>,
  i: (c) => <i>{c}</i>,
  em: (c) => <em>{c}</em>,
  code: (c) => <code>{c}</code>,
};

/**
 * Shows a translated sentence that has markup in it, e.g. `Classes need <b>{n}</b> periods` or
 * `<link>Generate one first</link>.`, so the whole sentence is translated as one piece and each
 * language can put the bold words or the link where its word order needs them.
 */
export function Rich({ text, tags = {} }: { text: string; tags?: Record<string, (children: ReactNode) => ReactNode> }) {
  const all = { ...BASIC, ...tags };
  const parts: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/gs;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) parts.push(text.slice(at, m.index));
    const render = all[m[1]!];
    parts.push(render ? render(m[2]) : m[2]);
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}
