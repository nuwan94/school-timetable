import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createProject } from '@/packs';
import { Autosave, AutosaveDb, KEEP_PER_PROJECT } from './autosave';
import { useProjectStore } from './projectStore';

let dbCount = 0;
const fresh = () => new Autosave(new AutosaveDb(`test-${++dbCount}`));

describe('autosave', () => {
  it('restores the latest snapshot exactly', async () => {
    const autosave = fresh();
    const p = createProject('sl-gov', 'Ananda Test Vidyalaya');
    await autosave.write(p, null, true);
    const latest = await autosave.latest();
    expect(latest?.unsaved).toBe(true);
    expect(autosave.restore(latest!)).toEqual(p);
  });

  it(`keeps only the last ${KEEP_PER_PROJECT} snapshots per project`, async () => {
    const autosave = fresh();
    const p = createProject('simple');
    for (let i = 0; i < KEEP_PER_PROJECT + 5; i++) {
      await autosave.write({ ...p, institute: { ...p.institute, name: `v${i}` } }, null, true);
    }
    const list = await autosave.list(p.id);
    expect(list).toHaveLength(KEEP_PER_PROJECT);
    expect(list[0]!.schoolName).toBe(`v${KEEP_PER_PROJECT + 4}`);
  });
});

describe('project store', () => {
  it('marks edits dirty, bumps revision and stamps updatedAt', async () => {
    const store = useProjectStore.getState();
    store.newProject('sl-gov', 'X');
    store.markSaved('x.ttb', null);
    const before = useProjectStore.getState();
    await new Promise((r) => setTimeout(r, 2));
    before.update((d) => {
      d.institute.name = 'Y';
    });
    const after = useProjectStore.getState();
    expect(after.dirty).toBe(true);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.project!.institute.name).toBe('Y');
    expect(after.project!.updatedAt > before.project!.updatedAt).toBe(true);
    // Immutability: the old object is untouched.
    expect(before.project!.institute.name).toBe('X');
  });
});
