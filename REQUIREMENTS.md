# Nudge — Requirements

_Last updated: 2026-06-25_

A local-first, offline-capable todo app for the browser, working cleanly on
mobile and desktop, with time-sensitive todos, flexible recurrence, and
reminders delivered even when the app is closed.

## 1. Goals

- **Offline-first / local-first**: full functionality with no internet; changes
  sync automatically when connectivity returns.
- **Multi-device auto-sync**: the same todos on phone + desktop, kept in sync.
- **Time-sensitive todos** with reminders sent _before_ the event.
- **Flexible recurrence**: daily, every-other-day, every N days, specific
  weekdays, monthly, and custom cadences.
- **Reminder delivery** via **email** and **web push** (push arrives even when
  the app is closed).
- **Forever-free infrastructure** for a single personal user.
- **Accessible everywhere**: it's a website (responsive), installable as a PWA.

## 2. Non-goals (for now)

- **SMS reminders** — no reliable free SMS exists; deferred. Email + web push
  cover the "notify me even when the app is closed" need. SMS may be added later
  as an optional paid (Twilio) channel; the reminder system will be structured
  so it can plug in without rework.
- **Lock-screen / home-screen widget** — wanted eventually, but out of scope for
  v1. Web push notifications approximate it. Revisit after the site is solid.
- **Sharing / collaboration / multi-user** — single-user app.
- **Native mobile apps** — PWA only.

## 3. Decisions locked

| Area            | Decision                                                        |
| --------------- | --------------------------------------------------------------- |
| Reminder channels | Email + Web Push (free, reliable). SMS deferred.              |
| Offline model   | Local-first; works offline, auto-syncs when back online.        |
| Sync            | Multi-device auto-sync via a backend.                           |
| Sign-in         | Email magic link (passwordless).                                |
| Infra           | Cloudflare — Workers + D1 + Pages.                              |
| Install         | Responsive website first; installable PWA. Widget later.        |

## 4. Functional requirements

### 4.1 Todos
- Create / edit / complete / delete todos.
- Fields: title, optional notes, optional due date+time, optional reminder
  offset(s), recurrence rule, completion state, timestamps.
- A todo can be a one-off or recurring.
- Time-sensitive todos have a specific date+time; non-time-sensitive todos are
  just tasks (no reminder).

### 4.2 Recurrence
- Supported cadences:
  - Daily
  - Every other day / every N days
  - Specific weekdays (e.g. Mon/Wed/Fri)
  - Weekly / every N weeks
  - Monthly (by day-of-month) / every N months
  - (Stretch) custom rules
- When a recurring todo's instance is completed (or its time passes), the next
  occurrence is generated automatically.
- Editing a recurring todo: choose to apply to this occurrence only or all
  future occurrences.

- Two reminder shapes per todo:
  - **One-shot offset(s)**: "remind me _X before_" (e.g. 10 min, 1 hour, 1 day
    before). One or more allowed.
  - **Recurring / "nag" reminder**: repeat on a cadence over a window, ending
    when the task is completed. Example: _"starting 1 week before the due date,
    remind me every day at 9am until I mark it done"_ (e.g. filing a tax return).
    Configurable: window start (offset before due, or an absolute date), cadence
    (e.g. daily, every other day, weekday at a set time), and stop condition
    (default: when completed; also stops at/after the due date).
- This is distinct from **task recurrence** (§4.2): task recurrence repeats the
  todo itself; a nag reminder repeats the _reminder_ for a single todo until that
  todo is done.
- Reminder content includes the todo title + optional notes/custom text.
- Reminders are delivered via email and/or web push (user picks channels).
- Snooze a reminder (e.g. +10 min, +1 hour).
- Completing the task cancels all of its pending/recurring reminders.
- Reminders fire reliably even when the app is closed (handled server-side).
- Timezone-aware; reminders respect the user's local time.

### 4.4 Sync
- All data usable offline (IndexedDB).
- Local changes queue and reconcile with the backend when online.
- Conflict resolution: last-write-wins per field (sufficient for a todo app),
  with soft-deletes (tombstones) so deletions propagate.
- Sync is automatic and background; manual "sync now" available.

### 4.5 Accounts / auth
- Passwordless email magic link.
- A session persists on each device so sync "just works" after first sign-in.
- The same email = the same synced dataset across devices.

### 4.6 Notifications / PWA
- Installable PWA (add to home screen, desktop install).
- Service worker for offline asset caching + receiving web push.
- Request notification permission with clear UX; degrade gracefully if denied
  (fall back to email-only reminders).

### 4.7 Google Calendar sync (later stage)
- Connect a Google account (OAuth) and sync todos one-way into a dedicated
  "Todos" calendar (kept separate from the user's real events; easy to toggle).
- **Daily agenda block**: every todo due _that day_ appears as a single short
  all-day-ish event in a **tiny block at 06:00** (e.g. 06:00–06:15) titled like
  "Today: 3 tasks" with the task list in the description. This gives an at-a-
  glance morning overview without cluttering the day.
- **Timed tasks also get their own block**: if a todo has a specific time, it is
  _additionally_ added as an event at that time (default short duration, e.g.
  15 min) so it shows in the correct time slot — in addition to appearing in the
  6am agenda block.
- Updates propagate: completing/editing/deleting a todo updates or removes its
  calendar event(s); recurring todos map to recurring calendar events where
  possible (else materialize upcoming occurrences).
- Reminders stay owned by our system (email/push); calendar events are a _view_,
  not the reminder mechanism (avoids duplicate Google notifications unless the
  user opts in).
- Conflicts/identity: store the Google `eventId` per todo (and per occurrence)
  so sync is idempotent; one-way (app → calendar) to start, with two-way as a
  possible future extension.
- Timezone-aware; the 6am block uses the user's local timezone.

### 4.8 AI enhancements (later stage)
Uses Cloudflare **Workers AI** free/included quota (runs in the existing Worker;
no extra infra). All AI features are **optional, async, and non-blocking** — the
app works fully without them, and AI never gates creating/saving a todo.

- **Auto-tagging (primary)**: when a todo is created/edited, pass its title +
  notes to a small text model and get back 1–3 concise tags/categories
  (e.g. `finance`, `errand`, `health`). Tags are stored on the todo, editable by
  the user, and become the basis for filtering/grouping (introduces the tag
  concept deferred from v1).
- Suggested further uses (pick during design):
  - **Smart due-date / time parsing**: infer a date from natural-language titles
    ("file taxes by next Friday", "dentist tue 3pm") and pre-fill the schedule.
  - **Suggested reminder cadence**: for important/deadline-like tasks, propose a
    sensible nag (e.g. "remind daily for the last week").
  - **Priority / effort estimate**: classify urgency or rough effort to aid
    sorting.
  - **Subtask / checklist breakdown**: expand a vague task into a few concrete
    steps on request.
  - **Daily digest summary**: a one-line natural summary of the day's agenda
    (could feed the 6am calendar block description in §4.7).
- Constraints: runs server-side on demand (debounced), results cached; degrade
  silently on quota/error; respect privacy (only send task text, opt-out
  available); keep within Workers AI free allowance.

### 4.9 Durable git backup & recovery (later stage)
The primary state store (D1 / a device) could be lost. To guarantee tasks are
never lost, the system continuously mirrors a full snapshot into a **separate
private GitHub repo** (`nudge-backup`). Git history then doubles as versioned,
point-in-time disaster recovery.

- **What's backed up**: the complete dataset — every todo (incl. completed and
  soft-deleted tombstones), all reminders, tags, recurrence rules, and the
  minimal user record. Enough to rebuild state from scratch with nothing else.
- **Format** (machine-first, human-readable):
  - `data/todos.json` — canonical full snapshot (array of todos, all fields).
  - `data/meta.json` — `{ schemaVersion, exportedAt, appVersion, counts }`.
  - `TASKS.md` — generated human-readable view of open tasks + reminders.
- **Cadence**: pushed by the Cloudflare Worker (a) debounced after meaningful
  changes and (b) on a daily cron as a floor. Each push is one commit, so the
  git log is the recovery timeline.
- **Auth**: a fine-grained GitHub PAT (write scope, **only** the backup repo)
  stored as a Worker secret. Commits via the GitHub REST API — no checkout
  needed in the Worker.
- **Recovery**: the backup repo carries its own `README.md` (schema + manual
  restore) and `AGENTS.md` (step-by-step instructions for an AI agent to rebuild
  the running app's state from `data/todos.json`). Restore = import the latest
  (or any historical) `todos.json` back into D1 / IndexedDB.
- **Independence**: the backup is decoupled from the live store and from device
  sync — if Cloudflare, D1, or all devices vanish, the repo alone is sufficient
  to fully reconstruct tasks and reminders.
- **Privacy**: private repo; contains personal task text. Treated as sensitive;
  PAT least-privilege; optional client-side encryption is a future option.

## 5. Non-functional requirements

- **Cost**: stays within Cloudflare + email-provider free tiers for one user.
- **Offline**: app loads and is fully functional with zero network.
- **Performance**: instant local interactions; sync never blocks the UI.
- **Privacy**: personal data; minimal collection (email + todos only).
- **Responsive**: usable one-handed on a phone and comfortable on desktop.

## 6. Architecture (proposed)

```
┌─────────────────────────────────────────────┐
│  Browser (PWA)                               │
│  • UI (responsive, mobile + desktop)         │
│  • IndexedDB  ← source of truth offline      │
│  • Service worker: offline cache + push recv │
│  • Sync engine: change queue → backend       │
└───────────────┬─────────────────────────────┘
                │ HTTPS (when online)
┌───────────────▼─────────────────────────────┐
│  Cloudflare                                  │
│  • Pages: hosts the static PWA               │
│  • Worker: sync API + auth (magic link)      │
│  • D1: server copy of todos + reminders      │
│  • Cron Trigger: scans due reminders,        │
│    sends email + web push                    │
│  • Email provider (Resend/Brevo free tier)   │
└─────────────────────────────────────────────┘
```

Reminders are scheduled server-side (D1 + Cron Trigger) so they fire regardless
of whether any device is awake. Web push uses VAPID keys; the service worker
displays the notification.

## 7. Data model (sketch)

- **user**: id, email, created_at, google_oauth (tokens for Calendar sync)
- **todo**: id, user_id, title, notes, due_at, recurrence_rule, completed_at,
  updated_at, deleted_at (tombstone)
  - tags: string[] (user-editable; AI-suggested per §4.8)
  - ai: { tags_suggested?, last_model?, ... } (provenance, optional)
  - calendar: { agenda_event_id?, timed_event_id? } (Google sync, §4.7)
- **reminder**: id, todo_id, type[one_shot|recurring], channels[email|push],
  next_fire_at, last_fired_at, status
  - one_shot: offset (e.g. -PT1H before due)
  - recurring: window_start (offset before due or absolute), cadence rule
    (e.g. daily at 09:00), stop_condition (on_complete | at_due), time_of_day
- **push_subscription**: id, user_id, endpoint, keys, device label
- **sync metadata**: per-record updated_at / version for last-write-wins

## 8. Tech stack (proposed)

- **Frontend**: React + Vite + TypeScript + a local-first data layer over
  IndexedDB; recurrence via an RRULE-style library.
- **UI**: Tailwind CSS v4 + shadcn/ui (Radix primitives), Lucide icons,
  Inter/system font, Framer Motion for restrained interaction animation.
- **PWA**: service worker (offline cache + push), web app manifest.
- **Backend**: Cloudflare Worker (API + auth + cron), D1 (SQLite).
- **Hosting**: Cloudflare Pages.
- **Email**: Resend or Brevo free tier.

## 8a. UI/UX direction — "Crisp & dense" (Linear-style)

- **Vibe**: monochrome surface + a single sharp accent color; tight, information-
  dense rows; fast and pro. **Dark by default**, with a light theme available.
- **Desktop = keyboard-first**: `⌘K` command palette, `↑/↓` to move, `⏎` to open,
  quick-add from anywhere, shortcuts for complete/snooze/schedule.
- **Mobile adaptation**: same aesthetic but touch-safe — larger hit targets,
  swipe-to-complete / swipe-to-snooze, bottom sheets for edit, quick-add bar.
- **Principles**: one accent color, strict type scale, spacing over borders,
  chrome hidden until needed, content-first. Restrained motion (check/strike,
  reorder, sheet transitions) — never decorative.
- **Reference apps**: Linear (primary), with Things 3 / Todoist for todo-specific
  interaction patterns.

## 9. Open questions / to confirm later

Resolved:
- ~~Frontend framework~~ → React + Vite + TS (§8).
- ~~Visual/design direction~~ → Crisp & dense / Linear-style, dark by default (§8a).

Resolved:
- ~~Tags/categories in v1~~ → No. v1 is a flat list with a Today/Upcoming split.
  Tags can come later.
- ~~History retention~~ → Completed items auto-archive after 30 days; keep only
  the last ~10 occurrences of a recurring todo locally.

## 10. Suggested phased roadmap

1. **v0 — Local core (offline only):** todos, due dates, recurrence engine,
   IndexedDB, responsive UI, PWA install. No account, no sync. Fully usable.
2. **v1 — Reminders while open + email:** in-app notifications; backend +
   magic-link auth + email reminders via cron.
3. **v2 — Durable git backup (§4.9):** mirror full state to a private
   `nudge-backup` repo (debounced + daily). Cheap insurance; lands as soon as
   the server holds the dataset.
4. **v3 — Sync:** multi-device auto-sync with conflict handling.
5. **v4 — Web push:** reminders that fire with the app closed.
6. **v5 — AI enhancements (§4.8):** Workers AI auto-tagging first, then optional
   smart date parsing / suggestions. Introduces tags into the UI.
7. **v6 — Google Calendar sync (§4.7):** OAuth + one-way sync; 6am daily agenda
   block + per-time blocks for timed tasks.
8. **Later:** SMS (optional/paid), lock-screen widget, two-way calendar sync,
   encrypted backups.
