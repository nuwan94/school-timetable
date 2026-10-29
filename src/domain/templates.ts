import type { Draft } from 'immer';
import { z } from 'zod';
import { newId } from './common';
import { scheduleForClass } from './checks';
import { CurriculumTemplate } from './entities';
import { doublesIn, patternFrom, patternPeriods } from './factories';
import { findCellAllocation, setCellAllocation } from './mutations';
import type { Project } from './project';
import { teachingSlots } from './time';
import { tx } from '@/i18n';

/**
 * Grade curriculum templates: "Grade 6 = Maths 6, Science 5 …", versioned by
 * curriculum year (e.g. "NIE 2024 reform") because NIE allocations change.
 * Subjects are referenced by short code so templates move between schools.
 * The app ships no official figures — schools build or import them.
 */

const subjectKey = (s: { shortCode: string; name: string }) => (s.shortCode || s.name).trim();

export function templateFromClass(p: Project, classId: string, meta: { name: string; version: string }): CurriculumTemplate {
  const cls = p.classes.find((c) => c.id === classId);
  const grade = p.grades.find((g) => g.id === cls?.gradeId);
  const items = p.subjects.flatMap((s) => {
    const a = findCellAllocation(p, classId, s.id);
    if (!a) return [];
    return [{ subjectCode: subjectKey(s), amount: patternPeriods(a.pattern), unit: 'periods' as const, doubles: doublesIn(a.pattern) }];
  });
  return CurriculumTemplate.parse({
    id: newId('tpl'),
    name: meta.name,
    version: meta.version,
    gradeLevel: grade?.level ?? 0,
    stream: cls?.stream ?? '',
    items,
  });
}

export interface ApplyResult {
  cells: number;
  /** Template subject codes with no matching subject in this project. */
  missing: string[];
}

/** Sets periods (keeping teachers) for each class from the template. */
export function applyTemplate(d: Draft<Project>, template: CurriculumTemplate, classIds: string[]): ApplyResult {
  const missing: string[] = [];
  let cells = 0;
  for (const item of template.items) {
    const key = item.subjectCode.toLowerCase();
    const subject = d.subjects.find((s) => s.shortCode.toLowerCase() === key) ?? d.subjects.find((s) => s.name.toLowerCase() === key);
    if (!subject) {
      missing.push(item.subjectCode);
      continue;
    }
    for (const classId of classIds) {
      const cls = d.classes.find((c) => c.id === classId);
      if (!cls) continue;
      let periods = item.amount;
      if (item.unit === 'minutes') {
        // Convert using this class's typical period length.
        const length = teachingSlots(scheduleForClass(d as Project, cls)!, 'mon')[0]?.duration ?? 40;
        periods = Math.round(item.amount / length);
      }
      setCellAllocation(d, classId, subject.id, { pattern: patternFrom(periods, item.doubles) });
      cells++;
    }
  }
  return { cells, missing };
}

// ----------------------------------------------------------- import/export

const TEMPLATE_FILE = 'school-timetable-templates';

const TemplateFile = z.object({
  format: z.literal(TEMPLATE_FILE),
  version: z.literal(1),
  templates: z.array(CurriculumTemplate),
});

export function exportTemplates(templates: CurriculumTemplate[]): string {
  return JSON.stringify({ format: TEMPLATE_FILE, version: 1, templates }, null, 1);
}

/** Parses a template file; imported templates get fresh ids. */
export function parseTemplateFile(text: string): CurriculumTemplate[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(tx('This is not a template file (not valid JSON).'));
  }
  const result = TemplateFile.safeParse(json);
  if (!result.success) throw new Error(tx('This is not a valid timetable template file.'));
  return result.data.templates.map((t) => ({ ...t, id: newId('tpl') }));
}
