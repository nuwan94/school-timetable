import { diffVersion, type LessonChange } from '@/domain/midyear';
import type { Project } from '@/domain/project';
import type { TimetableVersion } from '@/domain/schedule';
import { dayName, LABELS, localName, type Lang } from './labels';
import type { Row, Sheet } from './sheets';

/**
 * Change notices (PLAN.md §7.3): one sheet per affected teacher listing only
 * their lessons that changed — before and now — with a line to sign for it.
 */

function slotLabel(p: Project, slotIds: string[]): string {
  const labels = slotIds.map((id) => {
    for (const b of p.bellSchedules) {
      const s = b.slots.find((x) => x.id === id);
      if (s) return s.label;
    }
    return '?';
  });
  return [...new Set(labels)].join('–');
}

function when(p: Project, s: LessonChange['before'], lang: Lang, teacherId: string): string {
  const L = LABELS[lang];
  if (!s || !s.teacherIds.includes(teacherId)) return L.noLesson;
  return `${dayName(lang, s.day, true)} ${slotLabel(p, s.slotIds)}`;
}

/** Teachers whose lessons change between the version's base and now. */
export function affectedTeacherIds(p: Project, version: TimetableVersion): string[] {
  return [...diffVersion(p, version).teachers.keys()].filter((id) => p.teachers.some((t) => t.id === id));
}

export function changeNotices(p: Project, version: TimetableVersion, lang: Lang, teacherIds?: string[]): Sheet[] {
  const L = LABELS[lang];
  const diff = diffVersion(p, version);
  const sheets: Sheet[] = [];
  const order = p.teachers.filter((t) => diff.teachers.has(t.id) && (!teacherIds || teacherIds.includes(t.id)));
  for (const t of order) {
    const rows: Row[] = diff.teachers
      .get(t.id)!
      .map((c) => ({
        c,
        before: when(p, c.before, lang, t.id),
        now: when(p, c.after, lang, t.id),
      }))
      // A teacher swap on an unchanged slot shows on both teachers' notices; same-slot rows for one teacher only if their part changed.
      .filter((x) => x.before !== x.now)
      .sort((a, b) => a.now.localeCompare(b.now))
      .map(({ c, before, now }) => ({
        kind: 'row',
        head: {
          lines: [
            c.classIds
              .map((id) =>
                localName(
                  p.classes.find((x) => x.id === id),
                  lang,
                ),
              )
              .join('+'),
          ],
        },
        cells: [
          {
            lines: [
              localName(
                p.subjects.find((s) => s.id === c.subjectId),
                lang,
              ),
            ],
          },
          { lines: [before], muted: true },
          { lines: [now] },
        ],
      }));
    if (!rows.length) continue;
    const name = localName(t, lang);
    sheets.push({
      id: `changeNotice:${version.id}:${t.id}`,
      kind: 'changeNotice',
      fileName: `change-notice-${(t.shortCode || t.name).replace(/[^\w-]+/g, '_')}`,
      paper: 'A4P',
      lang,
      school: localName(p.institute, lang) || p.institute.name,
      title: L.changeNotice,
      subtitle: name,
      meta: version.effectiveFrom ? [`${L.effectiveFrom}: ${version.effectiveFrom}`] : [],
      draft: version.status === 'draft',
      blocks: [
        {
          type: 'table',
          corner: L.class,
          head: [L.subject, L.before, L.now],
          rows,
        },
        { type: 'sign', labels: [`${L.received} — ${name}`, L.principal] },
      ],
    });
  }
  return sheets;
}
