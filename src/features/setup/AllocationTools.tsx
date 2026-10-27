import { useMemo, useRef, useState } from 'react';
import type { CurriculumTemplate, Grade, SchoolClass } from '@/domain/entities';
import { patternFrom } from '@/domain/factories';
import { setCellAllocation } from '@/domain/mutations';
import { applyTemplate, exportTemplates, parseTemplateFile, templateFromClass } from '@/domain/templates';
import { downloadBlob } from '@/io/projectFile';
import { parseAllocationPaste } from '@/io/paste';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, IconButton, Select, TrashIcon } from '@/ui/kit';
import { confirmDialog, promptDialog } from '@/ui/dialogs';

/** Toolbar above the matrix: apply / save templates for the current grade, paste from Excel. */
export function GradeTools({ grade, classes, onPaste }: { grade: Grade; classes: SchoolClass[]; onPaste: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [message, setMessage] = useState<string | null>(null);
  const templates = [...project.templates].sort(
    (a, b) => Math.abs(a.gradeLevel - grade.level) - Math.abs(b.gradeLevel - grade.level) || a.name.localeCompare(b.name),
  );

  const apply = async (id: string) => {
    const tpl = project.templates.find((t) => t.id === id);
    if (!tpl || classes.length === 0) return;
    const ok = await confirmDialog(`Apply "${tpl.name}"?`, {
      text: `${tpl.version ? `${tpl.version}\n` : ''}To ${classes.map((c) => c.name).join(', ')}. Periods are replaced; teachers are kept.`,
      confirmText: 'Apply',
    });
    if (!ok) return;
    let result = { cells: 0, missing: [] as string[] };
    update((d) => {
      result = applyTemplate(
        d,
        tpl,
        classes.map((c) => c.id),
      );
    });
    setMessage(
      `Set ${result.cells} cell(s).` + (result.missing.length ? ` No subject with code: ${result.missing.join(', ')} — add them in Subjects.` : ''),
    );
  };

  const save = async (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;
    const name = await promptDialog(`Save ${cls.name} as a template`, {
      label: 'Template name',
      value: `${grade.name}${cls.stream ? ` ${cls.stream}` : ''}`,
      required: true,
      confirmText: 'Next',
    });
    if (!name) return;
    const version = await promptDialog('Curriculum version', {
      label: 'For example "NIE 2024 reform" (optional)',
      value: project.templates[0]?.version ?? '',
      confirmText: 'Save template',
    });
    if (version === null) return;
    update((d) => {
      d.templates.push(templateFromClass(d as typeof project, classId, { name, version }));
    });
    setMessage(`Saved template "${name}" from ${cls.name}.`);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {templates.length > 0 && (
        <Select
          aria-label="Apply template"
          value=""
          options={[{ value: '', label: 'Apply template…' }, ...templates.map((t) => ({ value: t.id, label: `${t.name} · ${t.version}` }))]}
          onChange={apply}
          className="w-56"
        />
      )}
      {classes.length > 0 && (
        <Select
          aria-label="Save class as template"
          value=""
          options={[{ value: '', label: 'Save class as template…' }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={save}
          className="w-56"
        />
      )}
      <button className="btn" onClick={onPaste}>
        Paste from Excel
      </button>
      {message && (
        <span className="text-sm text-teal-800" role="status">
          {message}
        </span>
      )}
    </div>
  );
}

export function PasteAllocations({ onDone }: { onDone: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [text, setText] = useState('');
  const rows = useMemo(() => parseAllocationPaste(text, project), [text, project]);
  const good = rows.filter((r) => r.errors.length === 0);

  return (
    <Card title="Paste who-teaches-what from Excel">
      <p className="mb-2 text-sm text-slate-600">
        Either a <strong>list</strong> (Class · Subject · Periods · Teacher · Doubles) or a <strong>grid</strong> like the matrix: first row{' '}
        <code>Class</code> then subject codes, cells like <code>6 KP</code> or <code>5 1D NF</code>. Teachers by code or name. Existing cells are
        overwritten.
      </p>
      <textarea
        aria-label="Pasted allocations"
        className="field h-32 w-full font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Class\tMAT\tSCI\tENG\n6A\t6 KP\t5 1D NF\t4 MD\n6B\t6 SS\t5 1D SS\t4 MD'}
      />
      {rows.length > 0 && (
        <div className="mt-2 max-h-60 overflow-auto rounded border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-2 py-1">Row</th>
                <th className="px-2 py-1">Class</th>
                <th className="px-2 py-1">Subject</th>
                <th className="px-2 py-1">Periods</th>
                <th className="px-2 py-1">Teacher</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-t border-slate-100 ${r.errors.length ? 'bg-red-50' : ''}`}>
                  <td className="px-2 py-1 text-slate-500">{r.row}</td>
                  <td className="px-2 py-1">{r.label.cls}</td>
                  <td className="px-2 py-1">{r.label.subject}</td>
                  <td className="px-2 py-1 tabular-nums">
                    {r.periods}
                    {r.doubles > 0 && ` (${r.doubles}D)`}
                  </td>
                  <td className="px-2 py-1">{r.teacherId ? project.teachers.find((t) => t.id === r.teacherId)?.name : r.label.teacher || '—'}</td>
                  <td className="px-2 py-1 text-red-800">{r.errors.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          className="btn btn-primary"
          disabled={good.length === 0}
          onClick={() => {
            update((d) => {
              for (const r of good) {
                setCellAllocation(d, r.classId!, r.subjectId!, { pattern: patternFrom(r.periods, r.doubles), periods: r.periods });
                if (r.periods > 0) setCellAllocation(d, r.classId!, r.subjectId!, { teacherId: r.teacherId });
              }
            });
            setText('');
            onDone();
          }}
        >
          Apply {good.length} row(s)
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        {rows.length > good.length && <span className="text-sm text-red-800">{rows.length - good.length} row(s) with problems will be skipped.</span>}
      </div>
    </Card>
  );
}

/** All templates, grouped by curriculum version, with import/export. */
export function TemplateLibrary() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const byVersion = new Map<string, CurriculumTemplate[]>();
  for (const t of project.templates) byVersion.set(t.version || '(no version)', [...(byVersion.get(t.version || '(no version)') ?? []), t]);

  return (
    <Card
      title="Curriculum templates"
      actions={
        <>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import…
          </button>
          {project.templates.length > 0 && (
            <button
              className="btn"
              onClick={() => downloadBlob(new Blob([exportTemplates(project.templates)], { type: 'application/json' }), 'timetable-templates.json')}
            >
              Export all
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const imported = parseTemplateFile(await file.text());
                update((d) => {
                  d.templates.push(...imported);
                });
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </>
      }
    >
      <p className="mb-2 text-sm text-slate-600">
        Periods per subject for a grade, labelled with the curriculum version. Save one from a finished class, or import a file shared by another
        school. The app ships no official figures.
      </p>
      {error && <p className="mb-2 text-sm text-red-800">{error}</p>}
      {project.templates.length === 0 ? (
        <Empty>No templates yet. Use "Save class as template…" above the matrix.</Empty>
      ) : (
        <div className="space-y-3">
          {[...byVersion].map(([version, list]) => (
            <div key={version}>
              <p className="label">{version}</p>
              <ul className="divide-y divide-slate-100 text-sm">
                {list.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-1">
                    <span className="w-40 truncate font-medium">{t.name}</span>
                    <span className="flex-1 truncate text-xs text-slate-600">
                      {t.items.map((i) => `${i.subjectCode} ${i.amount}${i.doubles ? ` (${i.doubles}D)` : ''}`).join(' · ')} ={' '}
                      {t.items.reduce((s, i) => s + i.amount, 0)}
                    </span>
                    <IconButton
                      label={`Delete template ${t.name}`}
                      danger
                      onClick={async () => {
                        if (await confirmDialog(`Delete template "${t.name}"?`, { confirmText: 'Delete', danger: true }))
                          update((d) => {
                            d.templates = d.templates.filter((x) => x.id !== t.id);
                          });
                      }}
                    >
                      <TrashIcon />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
