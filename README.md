# School Timetable

A clash-free school timetable builder that runs as a frontend-only app in the browser. See [PLAN.md](PLAN.md).

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests (domain, autosave)
npm run build          # static site -> dist/
npm run build:single   # one offline HTML file -> dist-single/index.html
```

## Layout

- `src/domain/`: Zod schemas (the source of truth for all types), the time model, and file migrations
- `src/packs/`: defaults for each school pack (bell schedules, rule presets)
- `src/io/`: open/save of the project file (`.ttb`)
- `src/store/`: Zustand store, IndexedDB autosave and crash recovery
- `src/features/`: screens (start, project overview, PDF spike)
- `docs/spikes/`: spike write-ups
