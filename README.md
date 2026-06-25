# Nudge

> It nudges until it's done.

Offline-first, local-first todo app with time-sensitive reminders and flexible
recurrence. Crisp & dense (Linear-style) UI, mobile + desktop. See
[`REQUIREMENTS.md`](./REQUIREMENTS.md) for the full spec and roadmap.

**Status: v0 — offline core.** Todos, due dates, flexible recurrence, reminder
configuration, IndexedDB storage, installable PWA. No account/sync/reminder
delivery yet (those are v1–v3).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build + service worker
npm test           # recurrence engine tests
npm run typecheck
```

## Stack

- React + Vite + TypeScript
- Tailwind CSS v4 (design tokens in `src/index.css`)
- Dexie (IndexedDB) — local source of truth, `src/lib/db.ts`
- cmdk command palette, Lucide icons, date-fns
- vite-plugin-pwa (offline cache + manifest)

## Layout

```
src/
  lib/
    types.ts        domain model (Todo, Reminder, RecurrenceRule)
    db.ts           Dexie store + create/update/complete/delete
    recurrence.ts   next-occurrence engine (+ tests)
    grouping.ts     Overdue / Today / Upcoming / No date / Completed
    dates.ts        due-date formatting & composition
  components/
    App / TodoRow / QuickAdd / EditDialog / ReminderEditor / CommandPalette
```

## Keyboard (desktop)

`⌘K` command palette · `↑/↓` (or `j/k`) move · `⏎` open · `X` complete · `N` new task
