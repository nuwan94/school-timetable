import type { Draft } from 'immer';
import { patternPeriods } from '@/domain/factories';
import type { Project } from '@/domain/project';

const GRADES_SERVICE = ['SLTS 1', 'SLTS 2-I', 'SLTS 2-II', 'SLTS 3-I'];

/** Class teachers (where missing), appointment details for every teacher, and an approved cadre with a few gaps. */
export function finishExample(d: Draft<Project>, opts: { shortBy?: string[]; overBy?: string[] } = {}): void {
  const taken = new Set(d.classes.map((c) => c.classTeacherId).filter(Boolean));
  for (const c of d.classes) {
    if (c.classTeacherId) continue;
    const load = new Map<string, number>();
    for (const a of d.allocations)
      if (a.groupIds.includes(c.id)) for (const t of a.teacherIds) load.set(t, (load.get(t) ?? 0) + patternPeriods(a.pattern));
    const best = [...load].filter(([t]) => !taken.has(t)).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) {
      c.classTeacherId = best;
      taken.add(best);
    }
  }
  d.teachers.forEach((t, i) => {
    t.appointmentSubjectId = t.subjectIds[0] ?? null;
    t.appointmentMedium = t.media[0] ?? 'si';
    t.serviceGrade = GRADES_SERVICE[i % GRADES_SERVICE.length]!;
    const code = d.subjects.find((s) => s.id === t.appointmentSubjectId)?.shortCode ?? '';
    t.appointmentType = t.subjectIds.length > 1 || code === 'ENV' ? 'Trained (primary)' : i % 3 === 0 ? 'Trained' : 'Graduate';
  });
  const counts = new Map<string, number>();
  for (const t of d.teachers)
    if (t.category !== 'visiting' && t.appointmentSubjectId) counts.set(t.appointmentSubjectId, (counts.get(t.appointmentSubjectId) ?? 0) + 1);
  const code = (id: string) => d.subjects.find((s) => s.id === id)?.shortCode ?? '';
  const medium = d.teachers[0]?.appointmentMedium ?? 'si';
  d.cadre = [...counts].map(([subjectId, n]) => ({
    subjectId,
    medium,
    approved: n + (opts.shortBy?.includes(code(subjectId)) ? 1 : 0) - (opts.overBy?.includes(code(subjectId)) && n > 1 ? 1 : 0),
  }));
  d.institute.academicYear = '2027';
  d.institute.term = 'Term 1';
}
