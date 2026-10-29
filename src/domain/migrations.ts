import { FILE_FORMAT, Project, SCHEMA_VERSION } from './project';
import { tx } from '@/i18n';

/**
 * Each step upgrades raw JSON from version N to N+1. Steps operate on plain
 * objects (not typed Projects) because older files don't match today's schema.
 */
type Step = (raw: Record<string, unknown>) => Record<string, unknown>;

const STEPS: Record<number, Step> = {
  // 1: (raw) => ({ ...raw, schemaVersion: 2, newField: [] }),
};

export class ProjectFileError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

export function migrateRaw(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new ProjectFileError(tx('This is not a timetable project file.'));
  let raw = input as Record<string, unknown>;
  if (raw.format !== FILE_FORMAT) throw new ProjectFileError(tx('This is not a timetable project file.'));
  const declared = raw.schemaVersion;
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 1)
    throw new ProjectFileError(tx('The project file has an invalid version number.'));
  let version = declared;
  if (version > SCHEMA_VERSION)
    throw new ProjectFileError(
      tx('This file was saved by a newer version of the app (file v{file}, app v{app}). Please update the app.', {
        file: version,
        app: SCHEMA_VERSION,
      }),
    );
  while (version < SCHEMA_VERSION) {
    const step = STEPS[version];
    if (!step) throw new ProjectFileError(tx('No upgrade path from file version {version}.', { version }));
    raw = step(raw);
    version = raw.schemaVersion as number;
  }
  return raw;
}

/** Parse + migrate + validate any JSON value into a Project, or throw ProjectFileError. */
export function loadProject(input: unknown): Project {
  const raw = migrateRaw(input);
  const result = Project.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ProjectFileError(tx('The project file is damaged or incomplete.'), details);
  }
  return result.data;
}
