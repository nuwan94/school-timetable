import { z } from 'zod';

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** ISO date `YYYY-MM-DD`. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** Optional localised labels, used for Sinhala/Tamil print headings and short codes. */
export const LocalText = z
  .object({ si: z.string().optional(), ta: z.string().optional() })
  .partial();

/** Fields shared by every named entity. Retired entities keep `active: false` instead of being deleted. */
export const Named = z.object({
  id: Id,
  name: z.string().min(1),
  shortCode: z.string().default(''),
  local: LocalText.default({}),
  active: z.boolean().default(true),
});

export const Medium = z.enum(['si', 'ta', 'en']);
export type Medium = z.infer<typeof Medium>;

export const Pack = z.enum(['simple', 'sl-gov', 'international']);
export type Pack = z.infer<typeof Pack>;

let counter = 0;
/** Short, collision-resistant id; good enough for a single-user local file. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
