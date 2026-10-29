import { LANG_OPTIONS, tx, useLang } from '@/i18n';
import type { Lang } from '@/print/labels';

/** Picks the language of the app's screens; remembered on this device. Sheets keep their own print language. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <label className={`relative inline-flex items-center ${className}`} title={tx('Language of the screens (sheets have their own print language)')}>
      <span className="sr-only">{tx('Language')}</span>
      <select
        className="h-8 cursor-pointer appearance-none rounded-md border border-slate-300 bg-white py-0 pl-2.5 pr-7 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        data-testid="ui-lang"
      >
        {LANG_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-500" aria-hidden="true">
        <path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
