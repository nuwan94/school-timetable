import type { Project } from './project';
import type { RuleConfig } from './schedule';

/** Enabled rule config for a catalogue code, if any. */
export function ruleFor(p: Pick<Project, 'rules'>, code: string): RuleConfig | undefined {
  return p.rules.find((r) => r.code === code && r.enabled);
}

/** Does a rule apply to a class? Honours scope lists and min/maxGradeLevel params. */
export function ruleAppliesToClass(rule: RuleConfig, cls: { id: string; gradeId: string }, p: Pick<Project, 'grades' | 'sections'>): boolean {
  const grade = p.grades.find((g) => g.id === cls.gradeId);
  const level = grade?.level ?? 0;
  const { scope, params } = rule;
  if (scope.classIds.length && !scope.classIds.includes(cls.id)) return false;
  if (scope.gradeLevels.length && !scope.gradeLevels.includes(level)) return false;
  if (scope.sectionIds.length && !scope.sectionIds.includes(grade?.sectionId ?? '')) return false;
  if (typeof params.minGradeLevel === 'number' && level < params.minGradeLevel) return false;
  if (typeof params.maxGradeLevel === 'number' && level > params.maxGradeLevel) return false;
  return true;
}

export const numParam = (rule: RuleConfig | undefined, key: string, fallback: number): number => {
  const v = rule?.params[key];
  return typeof v === 'number' ? v : fallback;
};
