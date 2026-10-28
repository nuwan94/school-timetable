import { newId } from '@/domain/common';
import { WEEKDAYS, type Weekday } from '@/domain/time';
import { PACK_LABELS } from '@/packs';
import { useProjectStore } from '@/store/projectStore';
import { Card, Chips, NumberInput, PageHeader, Select, TextInput } from '@/ui/kit';
import { BellScheduleEditor } from './BellScheduleEditor';

const DAY_SHORT: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

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
      <PageHeader title="School & bell schedule">
        {PACK_LABELS[project.pack]}. Name your school, pick the working days, and set the bell times. Classes in each section
        follow that section's bell schedule.
      </PageHeader>

      <div className="space-y-4">
        <Card title="School">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {text('name', 'School name', 'e.g. Sri Sumangala Vidyalaya')}
            {localName('si', 'Name in Sinhala (for printing)')}
            {localName('ta', 'Name in Tamil (for printing)')}
            {text('address', 'Address')}
            {text('academicYear', 'Academic year', '2027')}
            {text('term', 'Term', 'Term 1')}
            {!project.simpleMode && text('gradeLabel', 'Call grades', 'Grade / Year')}
            {project.pack === 'international' && (
              <div>
                <label className="label" htmlFor="inst-weeks">
                  Teaching weeks a year
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
                Printed sheets in
              </label>
              <Select
                id="inst-printlang"
                value={institute.printLanguage}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'si', label: 'සිංහල (Sinhala)' },
                  { value: 'ta', label: 'தமிழ் (Tamil)' },
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
            <p className="label">Working days</p>
            <Chips
              value={institute.workingDays}
              options={WEEKDAYS.map((d) => ({ value: d, label: DAY_SHORT[d] }))}
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
          title="Bell schedules"
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
                      name: `Schedule ${d.bellSchedules.length + 1}`,
                      shortCode: '',
                      local: {},
                      active: true,
                      slots: (base?.slots ?? []).map((s) => ({ ...s, id: newId('slot') })),
                      dayOverrides: {},
                    });
                  })
                }
              >
                + Another schedule
              </button>
            )
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            Use another schedule when a section keeps different times (e.g. primary leaves earlier). Use{' '}
            <em>Different times on…</em> for one day, such as a shorter Friday.
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
