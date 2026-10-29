/**
 * Sinhala and Tamil for the UI, one file per area in `./dict`, each entry
 * `'English': ['සිංහල', 'தமிழ்']`. Best-effort translations of common school
 * usage in Sri Lanka; corrections are welcome.
 */
export type Dict = Record<string, readonly [si: string, ta: string]>;

const parts = import.meta.glob<{ default: Dict }>('./dict/*.ts', { eager: true });

export const SI: Record<string, string> = {};
export const TA: Record<string, string> = {};
for (const part of Object.values(parts))
  for (const [en, [si, ta]] of Object.entries(part.default)) {
    SI[en] = si;
    TA[en] = ta;
  }
