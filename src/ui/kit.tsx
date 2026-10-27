import { useEffect, useState, type ReactNode } from 'react';

/** Small shared building blocks for the setup screens. */

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold">{title}</h1>
      {children && <p className="mt-1 max-w-3xl text-sm text-slate-600">{children}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">{children}</p>;
}

/** Full width unless the caller sets an explicit `w-*` class. */
const width = (className: string) => (/(^|\s)w-/.test(className) ? '' : 'w-full');

/** Text input that edits on every keystroke (store updates are cheap and autosaved). */
export function TextInput({
  value,
  onChange,
  className = '',
  ...rest
}: { value: string; onChange: (v: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input {...rest} className={`field ${width(className)} ${className}`} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/**
 * Number input that lets the user clear the box while typing and commits a
 * number (or null when `nullable`) — avoids the "can't delete the 0" problem.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  nullable = false,
  className = '',
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'>) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      className={`field tabular-nums ${width(className)} ${className}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === '') {
          if (nullable) onChange(null);
          return;
        }
        let n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        onChange(n);
      }}
      onBlur={() => setText(value === null ? '' : String(value))}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  className = '',
  ...rest
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <select {...rest} className={`field ${width(className)} ${className}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Toggle chips for picking several values (days, media, subjects). */
export function Chips<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: readonly T[];
  options: readonly { value: T; label: string; title?: string }[];
  onChange: (v: T[]) => void;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={on}
            className={`rounded-full border ${pad} ${
              on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function IconButton({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 ${danger ? 'hover:text-red-700' : 'hover:text-slate-900'}`}
    >
      {children}
    </button>
  );
}

export const TrashIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
    <path d="M4 6h12M8 6V4h4v2m-6 0 .7 10h6.6L14 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const UpIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
    <path d="m5 12 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DownIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
    <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Coloured status pill used for totals (under / ok / over). */
export function LevelBadge({ level, children }: { level: 'ok' | 'under' | 'over' | 'none'; children: ReactNode }) {
  const cls = {
    ok: 'bg-emerald-100 text-emerald-900',
    under: 'bg-amber-100 text-amber-900',
    over: 'bg-red-100 text-red-900',
    none: 'bg-slate-100 text-slate-600',
  }[level];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${cls}`}>{children}</span>;
}
