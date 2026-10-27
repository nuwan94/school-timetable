import { dutyKey } from '@/domain/duties';
import type { Project } from '@/domain/project';
import type { DutyRoster } from '@/domain/schedule';
import { formatClock } from '@/domain/time';
import { dayName, LABELS, localName, type Lang } from './labels';
import type { Row, Sheet } from './sheets';

/** A duty roster for the staff-room notice board: a band per session, a row per post, a column per day. */
export function dutyRosterSheet(p: Project, roster: DutyRoster, lang: Lang): Sheet {
  const L = LABELS[lang];
  const who = new Map(roster.assignments.map((a) => [dutyKey(a), a.teacherId]));
  const tname = (id: string | undefined) =>
    id
      ? localName(
          p.teachers.find((t) => t.id === id),
          lang,
        )
      : '';
  const rows: Row[] = [];
  for (const s of roster.sessions) {
    if (roster.sessions.length > 1) rows.push({ kind: 'band', label: `${s.label}  ${formatClock(s.start)}–${formatClock(s.end)}` });
    for (const post of roster.posts)
      rows.push({
        kind: 'row',
        head: { lines: [post] },
        cells: roster.days.map((day) => ({ lines: [tname(who.get(dutyKey({ day, sessionId: s.id, post })))] })),
      });
  }
  const only = roster.sessions.length === 1 ? roster.sessions[0] : undefined;
  return {
    id: `duty:${roster.id}`,
    kind: 'dutyRoster',
    fileName: `duty-${roster.name.replace(/[^\w-]+/g, '_')}`,
    paper: roster.days.length > 5 ? 'A4L' : 'A4P',
    lang,
    school: localName(p.institute, lang) || p.institute.name,
    title: L.dutyRoster,
    subtitle: roster.name + (only ? ` · ${formatClock(only.start)}–${formatClock(only.end)}` : ''),
    meta: [p.institute.academicYear, p.institute.term].filter(Boolean),
    draft: false,
    blocks: [
      { type: 'table', corner: L.post, head: roster.days.map((d) => dayName(lang, d)), rows },
      { type: 'sign', labels: [L.principal] },
    ],
  };
}
