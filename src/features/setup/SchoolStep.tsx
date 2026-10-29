import { newId } from '@/domain/common';
import { WEEKDAYS } from '@/domain/time';
import { PACK_LABELS } from '@/packs';
import { useProjectStore } from '@/store/projectStore';
import { Card, Chips, NumberInput, PageHeader, Select, TextInput } from '@/ui/kit';
import { BellScheduleEditor } from './BellScheduleEditor';
import { dayShort, tx } from '@/i18n';
import { Rich } from '@/i18n/Rich';


export function SchoolStep() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const { institute } = project;

  const text = (key: 'name' | 'address' | 'academicYear' | 'term' | 'gradeLabel', label: string, placeholder = '') => (
    <div>
      <label className="label" htmlFor={`inst-${key}`}>
        {label}
      </label>
      <TextInput
        id={`inst-${key}`}
        value={institute[key]}
        placeholder={placeholder}
        onChange={(v) =>
          update((d) => {
            d.institute[key] = v;
          })
        }
      />
    </div>
  );

  const localName = (lang: 'si' | 'ta', label: string) => (
    <div>
      <label className="label" htmlFor={`inst-${lang}`}>
        {label}
      </label>
      <TextInput
        id={`inst-${lang}`}
        lang={lang}
        value={institute.local[lang] ?? ''}
        onChange={(v) =>
          update((d) => {
            d.institute.local[lang] = v;
          })
        }
      />
    </div>
  );

  return (
    <>
      <PageHeader title={tx('School & bell schedule')}>
        {tx('{pack}. Name your school, pick the working days, and set the bell times. Classes in each section follow that section’s bell schedule.', {
          pack: PACK_LABELS[project.pack],
        })}
      </PageHeader>

      <div className="space-y-4">
        <Card title={tx('School')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {text('name', tx('School name'), tx('e.g. Sri Sumangala Vidyalaya'))}
            {localName('si', tx('Name in Sinhala (for printing)'))}
            {localName('ta', tx('Name in Tamil (for printing)'))}
            {text('address', tx('Address'))}
            {text('academicYear', tx('Academic year'), '2027')}
            {text('term', tx('Term'), tx('Term 1'))}
            {!project.simpleMode && text('gradeLabel', tx('Call grades'), tx('Grade / Year'))}
            {project.pack === 'international' && (
              <div>
                <label className="label" htmlFor="inst-weeks">
                  {tx('Teaching weeks a year')}
                </label>
                <NumberInput
                  id="inst-weeks"
                  value={institute.teachingWeeks}
                  nullable
                  min={1}
                  max={52}
                  placeholder="e.g. 36"
                  onChange={(v) =>
                    update((d) => {
                      d.institute.teachingWeeks = v;
                    })
                  }
                />
              </div>
            )}
            <div>
              <label className="label" htmlFor="inst-printlang">
                {tx('Printed sheets in')}
              </label>
              <Select
                id="inst-printlang"
                value={institute.printLanguage}
                options={[
                  { value: 'en', label: tx('English') },
                  { value: 'si', label: tx('සිංහල (Sinhala)') },
                  { value: 'ta', label: tx('தமிழ் (Tamil)') },
                ]}
                onChange={(v) =>
                  update((d) => {
                    d.institute.printLanguage = v;
                  })
                }
              />
            </div>
          </div>
          <div className="mt-4">
            <p className="label">{tx('Working days')}</p>
            <Chips
              value={institute.workingDays}
              options={WEEKDAYS.map((d) => ({ value: d, label: dayShort(d) }))}
              onChange={(days) => {
                if (days.length === 0) return; // at least one day
                update((d) => {
                  d.institute.workingDays = WEEKDAYS.filter((w) => days.includes(w));
                });
              }}
            />
          </div>
        </Card>

        <Card
          title={tx('Bell schedules')}
          actions={
            !project.simpleMode && (
              <button
                className="btn"
                onClick={() =>
                  update((d) => {
                    const base = d.bellSchedules[0];
                    const id = newId('bell');
                    d.bellSchedules.push({
                      id,
                      name: tx('Schedule {x}', { x: d.bellSchedules.length + 1 }),
                      shortCode: '',
                      local: {},
                      active: true,
                      slots: (base?.slots ?? []).map((s) => ({ ...s, id: newId('slot') })),
                      dayOverrides: {},
                    });
                  })
                }
              >
                {tx('+ Another schedule')}
              </button>
            )
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            <Rich
              text={tx(
                'Use another schedule when a section keeps different times (e.g. primary leaves earlier). Use <em>Different times on…</em> for one day, such as a shorter Friday.',
              )}
            />
          </p>
          <div className="space-y-4">
            {project.bellSchedules.map((b) => (
              <BellScheduleEditor key={b.id} schedule={b} workingDays={institute.workingDays} />
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
