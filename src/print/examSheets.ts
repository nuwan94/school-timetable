import type { Project } from '@/domain/project';
import type { ExamSeries } from '@/domain/schedule';
import { weekdayOf } from '@/domain/relief';
import { formatClock } from '@/domain/time';
import { joinClassNames } from './sheets';
import { dayName, LABELS, localName, type Lang } from './labels';
import type { Row, Sheet } from './sheets';

/** Term-test outputs: the paper timetable (dates × sessions) and the invigilation roster with signatures. */

function base(p: Project, s: ExamSeries, lang: Lang, kind: 'examTimetable' | 'invigilation'): Sheet {
  const L = LABELS[lang];
  return {
    id: `${kind}:${s.id}`,
    kind,
    fileName: `${kind === 'examTimetable' ? 'exam-timetable' : 'invigilation'}-${s.name.replace(/[^\w-]+/g, '_')}`,
    paper: kind === 'examTimetable' ? 'A4L' : 'A4P',
    lang,
    school: localName(p.institute, lang) || p.institute.name,
    title: kind === 'examTimetable' ? L.examTimetable : L.invigilation,
    subtitle: `${s.name} · ${s.from} – ${s.to}`,
    meta: [],
    draft: false,
    blocks: [],
  };
}

const dates = (s: ExamSeries) => [...new Set(s.papers.map((pp) => pp.date))].sort();
const sessionHead = (x: ExamSeries['sessions'][number]) => `${x.label} ${formatClock(x.start)}–${formatClock(x.end)}`;

export function examTimetableSheet(p: Project, s: ExamSeries, lang: Lang): Sheet {
  const L = LABELS[lang];
  const sheet = base(p, s, lang, 'examTimetable');
  const cls = (id: string) =>
    localName(
      p.classes.find((c) => c.id === id),
      lang,
    );
  const rows: Row[] = dates(s).map((date) => ({
    kind: 'row',
    head: { lines: [date, dayName(lang, weekdayOf(date))] },
    cells: s.sessions.map((ses) => ({
      lines: s.papers
        .filter((pp) => pp.date === date && pp.sessionId === ses.id)
        .map(
          (pp) =>
            `${localName(
              p.subjects.find((x) => x.id === pp.subjectId),
              lang,
            )} — ${joinClassNames(pp.classIds.map(cls))}`,
        ),
    })),
  }));
  sheet.blocks.push({
    type: 'table',
    corner: L.date,
    head: s.sessions.map(sessionHead),
    rows,
  });
  sheet.blocks.push({ type: 'sign', labels: [L.principal] });
  return sheet;
}

export function invigilationSheet(p: Project, s: ExamSeries, lang: Lang): Sheet {
  const L = LABELS[lang];
  const sheet = base(p, s, lang, 'invigilation');
  const order = new Map(s.sessions.map((x, i) => [x.id, i]));
  const papers = [...s.papers].sort((a, b) => a.date.localeCompare(b.date) || (order.get(a.sessionId) ?? 0) - (order.get(b.sessionId) ?? 0));
  const rows: Row[] = [];
  let band = '';
  for (const pp of papers) {
    const ses = s.sessions.find((x) => x.id === pp.sessionId);
    const label = `${pp.date} · ${dayName(lang, weekdayOf(pp.date))} · ${ses ? sessionHead(ses) : ''}`;
    if (label !== band) rows.push({ kind: 'band', label: (band = label) });
    for (const c of pp.classIds) {
      const i = s.invigilation.find((x) => x.paperId === pp.id && x.classId === c);
      rows.push({
        kind: 'row',
        head: {
          lines: [
            localName(
              p.classes.find((x) => x.id === c),
              lang,
            ),
          ],
        },
        cells: [
          {
            lines: [
              localName(
                p.subjects.find((x) => x.id === pp.subjectId),
                lang,
              ),
            ],
          },
          {
            lines: [
              i
                ? localName(
                    p.teachers.find((t) => t.id === i.teacherId),
                    lang,
                  )
                : '—',
            ],
            muted: !i,
          },
          { lines: [''] },
        ],
      });
    }
  }
  sheet.blocks.push({
    type: 'table',
    corner: L.class,
    head: [L.subject, L.invigilator, L.signature],
    rows,
  });
  sheet.blocks.push({ type: 'sign', labels: [L.principal] });
  return sheet;
}
