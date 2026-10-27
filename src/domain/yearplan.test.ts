import { produce } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';
import { sampleSchool } from '@/packs/sample';
import { changeNotices } from '@/print/changeSheets';
import { examTimetableSheet, invigilationSheet } from '@/print/examSheets';
import { generateTimetable } from '@/solver';
import { makeTeacher } from './factories';
import { autoInvigilate, examClashes, examDates, examOverlay, invigilationLoad, makeExamSeries } from './exams';
import { diffVersion, examClassesLeave, longLeave, saveChangeVersion, teacherLeaves } from './midyear';
import type { Project } from './project';
import { candidates, coverNeeds, dayContext } from './relief';
import { approveActiveVersion, saveDraftVersion, snapshotOf } from './timetable';

const MON = '2027-01-04';
let p: Project;

beforeAll(async () => {
  const base = sampleSchool();
  const r = await generateTimetable(base, { seed: 1 });
  p = produce(base, (d) => {
    saveDraftVersion(d, r.placements, 'seed 1');
    approveActiveVersion(d, '2027-01-01');
  });
});

const approved = () => p.versions.find((v) => v.status === 'approved')!;

describe('mid-year changes', () => {
  it('a teacher leaving: load and class-teacher role move, few lessons shift, notices go to those affected', async () => {
    const leaver = p.teachers.find((t) => p.classes.some((c) => c.classTeacherId === t.id))!;
    // The replacement is a new appointee taking over the whole load.
    const to = makeTeacher({ name: 'New Teacher', subjectIds: leaver.subjectIds });
    const changed = produce(p, (d) => {
      d.teachers.push(to);
      teacherLeaves(d, leaver.id, to.id);
    });
    expect(changed.teachers.find((t) => t.id === leaver.id)!.active).toBe(false);
    expect(changed.allocations.some((a) => a.teacherIds.includes(leaver.id))).toBe(false);
    expect(changed.classes.some((c) => c.classTeacherId === leaver.id)).toBe(false);

    const base = approved();
    const r = await generateTimetable(changed, { seed: 1, optimiseMs: 800, start: { placements: base.placements, mode: 'minimal' } });
    expect(r.check.violations).toEqual([]);
    expect(r.unplaced).toEqual([]);
    const next = produce(changed, (d) => {
      saveChangeVersion(d, { name: 'leaves', effectiveFrom: '2027-02-01', placements: r.placements, baseId: base.id, baseSnapshot: snapshotOf(p, base) });
    });
    const v = next.versions.find((x) => x.id === next.activeVersionId)!;
    expect(v.basedOnId).toBe(base.id);
    const diff = diffVersion(next, v);
    // Every handed-over lesson changes teacher; few lessons move in time.
    const handed = diff.changes.filter((c) => c.what.includes('teacher'));
    expect(handed.length).toBeGreaterThan(0);
    expect(handed.every((c) => c.before!.teacherIds.includes(leaver.id) && c.after!.teacherIds.includes(to.id))).toBe(true);
    expect(diff.changes.filter((c) => c.what.includes('time')).length).toBeLessThan(base.placements.length * 0.2);
    expect(diff.teachers.has(leaver.id) && diff.teachers.has(to.id)).toBe(true);

    const notices = changeNotices(next, v, 'en');
    expect(notices.map((s) => s.subtitle)).toEqual(expect.arrayContaining([leaver.name, to.name]));
    expect(notices.every((s) => s.draft && s.blocks[0]!.type === 'table')).toBe(true);
    // Approving keeps the snapshot, so notices can still be printed afterwards.
    const done = produce(next, (d) => approveActiveVersion(d, '2027-02-01'));
    expect(changeNotices(done, done.versions.find((x) => x.id === done.activeVersionId)!, 'si').length).toBe(notices.length);
  }, 90_000);

  it('long leave: the timetable stays and the named cover teacher is suggested first', () => {
    const ctx0 = dayContext(p, MON);
    const lesson = ctx0.entries.find((e) => e.teacherIds.length === 1)!;
    const away = lesson.teacherIds[0]!;
    const free = p.teachers.find((t) => t.id !== away && !ctx0.entries.some((e) => e.start === lesson.start && e.teacherIds.includes(t.id)))!;
    const q = produce(p, (d) => longLeave(d, { teacherId: away, from: '2027-01-01', to: '2027-03-31', coverTeacherId: free.id, reason: 'Maternity leave' }));
    expect(q.versions).toEqual(p.versions);
    const ctx = dayContext(q, MON);
    expect(ctx.absent.get(away)?.coverTeacherId).toBe(free.id);
    const need = coverNeeds(q, ctx).find((n) => n.absentTeacherId === away && n.start === lesson.start)!;
    const list = candidates(q, ctx, need);
    expect(list[0]!.teacherId).toBe(free.id);
    expect(list[0]!.designated).toBe(true);
    // After the leave ends nobody needs cover.
    expect(dayContext(q, '2027-04-05').absent.has(away)).toBe(false);
  });

  it('exam classes leaving: their lessons need no relief', () => {
    const c = p.classes[0]!;
    const q = produce(p, (d) => examClassesLeave(d, { classIds: [c.id], from: '2027-01-01', to: '2027-12-31', name: 'O/L' }));
    const ctx = dayContext(q, MON);
    expect(ctx.removedClasses.has(c.id)).toBe(true);
    expect(ctx.entries.some((e) => e.classIds.length === 1 && e.classIds[0] === c.id)).toBe(false);
  });
});

describe('term tests', () => {
  const series = () => {
    const s = makeExamSeries({ name: 'First term test', from: '2027-03-01', to: '2027-03-12' });
    const g = p.classes.slice(0, 6).map((c) => c.id);
    const subjects = p.subjects.slice(0, 4);
    s.papers = subjects.map((sub, i) => ({ id: `pap${i}`, subjectId: sub.id, classIds: g, date: examDates(p, s)[i]!, sessionId: s.sessions[i % 2]!.id }));
    return s;
  };

  it('lists school days only', () => {
    const d = examDates(p, { from: '2027-03-01', to: '2027-03-14' });
    expect(d).toHaveLength(10); // two Mon–Fri weeks
    expect(d).not.toContain('2027-03-06');
  });

  it('assigns invigilators fairly with no clashes, not for their own subject', () => {
    const s = series();
    s.invigilation = autoInvigilate(p, s);
    expect(s.invigilation).toHaveLength(4 * 6);
    expect(examClashes(p, s)).toEqual([]);
    const loads = [...invigilationLoad(s).values()];
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it('skips absent teachers and reports clashes', () => {
    const s = series();
    const absentAll = produce(p, (d) => {
      d.overlays.push({
        id: 'camp',
        name: 'Marking camp',
        shortCode: '',
        local: {},
        active: true,
        kind: 'markingCamp',
        from: '2027-03-01',
        to: '2027-03-12',
        blockedRoomIds: [],
        removedGroupIds: [],
        absentTeacherIds: [p.teachers[0]!.id],
        note: '',
      });
    });
    s.invigilation = autoInvigilate(absentAll, s);
    expect(s.invigilation.some((i) => i.teacherId === p.teachers[0]!.id)).toBe(false);

    // A class with two papers at once, and one teacher in two rooms.
    s.papers.push({ ...s.papers[0]!, id: 'dup', subjectId: p.subjects[5]!.id });
    s.invigilation.push({ paperId: 'dup', classId: s.papers[0]!.classIds[0]!, teacherId: s.invigilation[0]!.teacherId });
    const kinds = new Set(examClashes(absentAll, s).map((c) => c.kind));
    expect(kinds.has('classTwice')).toBe(true);
    expect(kinds.has('invigilatorTwice')).toBe(true);
    expect(kinds.has('noInvigilator')).toBe(true);
  });

  it('adds one calendar event and prints both sheets', () => {
    const s = series();
    s.invigilation = autoInvigilate(p, s);
    const q = produce(p, (d) => {
      d.exams.push(s);
      examOverlay(d, s);
      examOverlay(d, s); // idempotent
    });
    expect(q.overlays.filter((o) => o.id === `ovl_${s.id}`)).toHaveLength(1);
    expect(dayContext(q, '2027-03-02').removedClasses.size).toBe(6);
    const rows = (b: ReturnType<typeof examTimetableSheet>['blocks'][number] | undefined) =>
      b?.type === 'table' ? b.rows.filter((r) => r.kind === 'row').length : -1;
    expect(rows(examTimetableSheet(q, s, 'ta').blocks[0])).toBe(4);
    expect(rows(invigilationSheet(q, s, 'si').blocks[0])).toBe(24);
  });
});
