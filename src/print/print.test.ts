import { produce } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Project } from '@/domain/project';
import type { TimetableVersion } from '@/domain/schedule';
import { approveActiveVersion, saveDraftVersion } from '@/domain/timetable';
import { sampleSchool } from '@/packs/sample';
import { generateTimetable } from '@/solver';
import { bundleHtml } from './bundle';
import { LABELS } from './labels';
import { buildSheets, type Block, type Sheet } from './sheets';

let p: Project;
let version: TimetableVersion;

beforeAll(async () => {
  const base = sampleSchool();
  const r = await generateTimetable(base, { seed: 1 });
  p = produce(base, (d) => void saveDraftVersion(d, r.placements, 'seed 1'));
  version = p.versions[0]!;
});

const table = (s: Sheet, i = 0) => s.blocks.filter((b): b is Extract<Block, { type: 'table' }> => b.type === 'table')[i]!;
const text = (s: Sheet) => JSON.stringify(s);

describe('labels', () => {
  it('has every label in Sinhala and Tamil', () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((x) => `${k}.${x}`) : [k]));
    expect(keys(LABELS.si)).toEqual(keys(LABELS.en));
    expect(keys(LABELS.ta)).toEqual(keys(LABELS.en));
  });
});

describe('sheets', () => {
  it('class sheets: one per class, full week, subject list adds up to 40', () => {
    const sheets = buildSheets(p, version, 'class', { lang: 'en' });
    expect(sheets).toHaveLength(18);
    const s = sheets[0]!;
    expect(s).toMatchObject({ paper: 'A4P', draft: true, fileName: 'class-6A' });
    const week = table(s);
    expect(week.head).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    expect(week.rows.filter((r) => r.kind === 'row')).toHaveLength(8);
    expect(week.rows.filter((r) => r.kind === 'band').length).toBeGreaterThanOrEqual(1);
    expect(text(s)).not.toContain('Self-study');
    const list = table(s, 1);
    // Block lines list each option's subject, so sum the non-block subjects + one per line.
    const total = list.rows.reduce((n, r) => n + (r.kind === 'row' ? Number(r.cells[1]!.lines[0]) : 0), 0);
    expect(total).toBeGreaterThanOrEqual(40);
    expect(s.subtitle).toContain('Class teacher');
  });

  it('prints in Sinhala and Tamil using local names', () => {
    const si = buildSheets(p, version, 'class', { lang: 'si', ids: [p.classes[0]!.id] })[0]!;
    expect(si.title).toContain('පන්ති කාලසටහන');
    expect(si.school).toBe('නියැදි මහා විද්‍යාලය');
    expect(text(si)).toContain('ගණිතය');
    expect(table(si).head[0]).toBe('සඳුදා');
    const ta = buildSheets(p, version, 'teacher', { lang: 'ta' })[0]!;
    expect(ta.title).toContain('ஆசிரியர் நேர அட்டவணை');
    expect(table(ta).head[4]).toBe('வெள்ளி');
  });

  it('teacher sheets show their own subject in block lessons and weekly totals', () => {
    const bud = p.teachers.find((t) => t.shortCode.length && p.subjects.find((s) => s.shortCode === 'BUD' && t.subjectIds.includes(s.id)))!;
    const s = buildSheets(p, version, 'teacher', { lang: 'en', ids: [bud.id] })[0]!;
    expect(text(s)).toContain('Buddhism');
    const facts = s.blocks.find((b) => b.type === 'facts');
    expect(facts?.type === 'facts' && Number(facts.items[0]![1])).toBeGreaterThan(0);
  });

  it('master staff chart: A3 landscape, 40 period columns, paginated with repeating section bands', () => {
    const pages = buildSheets(p, version, 'masterStaff', { lang: 'en' });
    expect(pages.length).toBe(Math.ceil(p.teachers.length / 26));
    for (const s of pages) {
      expect(s.paper).toBe('A3L');
      expect(table(s).head).toHaveLength(40);
      expect(table(s).headGroups!.map((g) => g.span)).toEqual([8, 8, 8, 8, 8]);
      expect(table(s).rows.length).toBeLessThanOrEqual(26);
    }
    if (pages.length > 1) expect(pages[1]!.subtitle).toMatch(/Page 2/);
  });

  it('master class chart (one per day), free-period chart and class list', () => {
    expect(buildSheets(p, version, 'masterClassDay', { lang: 'en' }).map((s) => s.fileName)).toEqual([
      'master-classes-mon',
      'master-classes-tue',
      'master-classes-wed',
      'master-classes-thu',
      'master-classes-fri',
    ]);
    const free = buildSheets(p, version, 'free', { lang: 'en' })[0]!;
    const cells = table(free).rows.flatMap((r) => (r.kind === 'row' ? r.cells.flatMap((c) => c.lines) : []));
    expect(cells.some((l) => l.length > 0)).toBe(true);
    const list = buildSheets(p, version, 'classList', { lang: 'en' })[0]!;
    expect(table(list).rows.filter((r) => r.kind === 'row')).toHaveLength(18);
  });

  it('approved timetables are not marked draft and show the effective date', () => {
    const q = produce(p, (d) => approveActiveVersion(d, '2027-01-05'));
    const s = buildSheets(q, q.versions[0]!, 'class', { lang: 'en' })[0]!;
    expect(s.draft).toBe(false);
    expect(s.meta.join()).toContain('2027-01-05');
  });
});

describe('review bundle', () => {
  it('is one self-contained HTML file with every sheet and no scripts', () => {
    const sheets = [...buildSheets(p, version, 'class', { lang: 'si' }), ...buildSheets(p, version, 'teacher', { lang: 'si' })];
    const html = bundleHtml(sheets, { title: 'Sample', note: 'Draft', fontFaces: '@font-face{}' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect((html.match(/class="page"/g) ?? []).length).toBe(sheets.length);
    expect(html).toContain('ගණිතය');
    expect(html).toContain('href="#s-class_');
  });
});

describe('joinClassNames', () => {
  it('compacts whole-grade lessons', async () => {
    const { joinClassNames } = await import('./sheets');
    expect(joinClassNames(['10A', '10B', '10C'])).toBe('10ABC');
    expect(joinClassNames(['9A'])).toBe('9A');
    expect(joinClassNames(['6A', '7B', 'Lower Kindergarten'])).toBe('6A+7B+Lower Kindergarten');
  });
});
