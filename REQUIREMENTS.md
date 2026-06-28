# Nudge — Requirements

_Last updated: 2026-06-28 · Live at https://nudge.edge.bond_

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
| Sign-in         | Email magic link or password.                                   |
| Infra           | Cloudflare — Worker (serves SPA + API) + D1.                    |
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

### 4.7 Google Calendar sync ✅ shipped
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

### 4.8 AI enhancements ✅ auto-tagging shipped
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

### 4.9 Durable git backup & recovery ✅ shipped
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

### 4.10 Habits — alerting, tracking & reporting 🟡 planned

Habits are recurring personal practices (e.g. **yoga, meditation, violin**) where
the value is **consistency over time**, not one-off completion. A habit is a
**first-class entity, distinct from a todo**: a todo is done once and archived; a
habit is _expected repeatedly_ and the interesting data is the **log of each
occurrence** (streaks, completion rate, trends). Habits **reuse** the existing
recurrence engine (§4.2) and the server-side reminder/cron pipeline (§4.3), but
own a separate **append-only completion log** so history is never lost when an
occurrence rolls forward.

#### 4.10.1 Habit definition
- Create / edit / archive / delete a habit. Fields: title, optional notes,
  optional icon/emoji, schedule (below), measurement type (below), target time
  of day, alerting config, tags (reuses §4.8 vocabulary), timestamps.
- Habits are **archivable** (hidden from daily view, history retained) and
  soft-deletable (tombstone, like todos) so backup/sync stay consistent.

#### 4.10.2 Schedule — when a habit is "expected" (both models, per habit)
Each habit picks **one** scheduling model:
- **Fixed weekdays** — expected on specific days (e.g. yoga **Mon/Wed/Fri**).
  Reuses the weekly `RecurrenceRule.weekdays`. A day not in the set is an **off
  day** (never counted as a miss, never nagged).
- **Flexible target** — a periodic count with no fixed days (e.g. meditate **5×
  per week**, violin **20× per month**). Any day can satisfy it; the period
  (week/month) is the unit of success, not the individual day.
- Daily ("every day") is the trivial fixed case (all 7 weekdays).
- Timezone-aware: "today" and period boundaries use the user's local time.

#### 4.10.3 Measurement — per-habit choice (binary or measured)
Each habit picks **one** measurement type:
- **Binary** — done / skipped / missed (e.g. yoga: "did it or not").
- **Measured** — a numeric amount per session with a **unit** and optional
  **per-session target** (e.g. meditation **20 min**, violin **30 min**,
  pushups **50 reps**). Logging captures the amount; a session counts as "done"
  when logged (optionally: only when it meets the target — configurable).
- Optional free-text **note** per log entry, regardless of type.

#### 4.10.4 Logging & state
- **Log an occurrence** in one tap: mark today done (and undo). Measured habits
  prompt for the amount (with the last value pre-filled for speed).
- Three states per expected occurrence: **done**, **skip** (intentional rest —
  preserves streak), **miss** (expected but not done — breaks streak). Misses are
  **derived** when an expected day/period passes without a log, not stored
  eagerly.
- **Backfill**: log or amend a past day (e.g. forgot to log yesterday). Editing
  history recomputes streaks/stats.
- **Log from the notification** where the platform allows (notification action →
  "Mark done" / "Skip"), falling back to deep-linking into the app.

#### 4.10.5 Alerting (reuses §4.3 cron + email/push)
- Per-habit **scheduled nudge** at the habit's target time of day, **only on
  expected days** (fixed model) or while the period target is unmet (flexible
  model). No nag on off days or once the period goal is met.
- **Escalation (optional)**: if not logged by end of the expected window, a
  follow-up nudge ("you haven't done yoga today").
- **Streak-at-risk (optional)**: warn when an active streak is about to break
  (e.g. last expected day of the period with the target still unmet).
- Channels: email + web push, same as todo reminders; user picks per habit.
- Snooze applies (consistent with §4.3 once shipped).

#### 4.10.6 Tracking metrics (per habit)
- **Current streak** and **longest streak** (skips don't break; misses do).
- **Completion rate** over rolling 7 / 30 / 90 days (and per period for flexible
  habits, e.g. "4 / 5 this week").
- For measured habits: **total** and **average** amount over a window
  (e.g. "320 min meditation this month, avg 16 min/session").
- **Last done** + days since.

#### 4.10.7 Reporting (heatmap + streaks + cross-habit review)
- **Per-habit detail**: GitHub-style **calendar heatmap**, current/longest
  streak, completion % over 7/30/90 days, and (measured) amount totals/averages.
- **Cross-habit review**: a **weekly / monthly summary** across all habits —
  per-habit completion vs target, overall consistency, and a **trend** signal
  (improving / steady / slipping vs the prior period).
- Reporting is **read-only and derived** from the log; it never mutates state.

#### 4.10.8 Placement & UX
- Habits live in their **own section/view** (definitions, history, reports), kept
  out of the Overdue/Today/Upcoming todo grouping (§4.1) to avoid tangling.
- **Today's due habits are surfaced at the top of the main todo list** as a
  compact strip for one-glance daily logging (tap to mark done), without making
  them todos.
- Follows the "Crisp & dense" direction (§8a): fast logging, keyboard-friendly on
  desktop, swipe/tap on mobile, restrained motion.

#### 4.10.9 Sync, backup & offline
- Habits and their logs are **offline-first** (IndexedDB) and sync via the same
  push/pull + last-write-wins model as todos (§4.4). Logs are append-mostly;
  edits/backfills carry `updatedAt` for conflict resolution.
- Included in the git backup snapshot (§4.9): `data/habits.json` +
  `data/habit_logs.json`, and reflected in the human-readable view.

## 5. Non-functional requirements

- **Cost**: stays within Cloudflare + email-provider free tiers for one user.
- **Offline**: app loads and is fully functional with zero network.
- **Performance**: instant local interactions; sync never blocks the UI.
- **Privacy**: personal data; minimal collection (email + todos only).
- **Responsive**: usable one-handed on a phone and comfortable on desktop.

## 6. Architecture (as built)

```
┌─────────────────────────────────────────────┐
│  Browser (PWA)  nudge.edge.bond              │
│  • React + IndexedDB (Dexie) — offline SoT  │
│  • Service worker: offline cache + push recv │
│  • Sync: debounced push + pull on login      │
└───────────────┬─────────────────────────────┘
                │ HTTPS (same-origin — Worker serves both)
┌───────────────▼─────────────────────────────┐
│  Cloudflare Worker  (nudge)                  │
│  • Serves static PWA (Worker Assets)         │
│  • /api/* — sync, auth, push, calendar       │
│  • D1: todos, reminders, push_subscriptions  │
│  • Cron (*/5 min): due reminders → email     │
│    + web push; calendar agenda refresh       │
│  • Workers AI: auto-tag on push              │
└─────────────────────────────────────────────┘
         │ email          │ web push      │ calendar
    Resend API       VAPID/FCM/APNs   Google Calendar API
```

Reminders are scheduled server-side (D1 + Cron Trigger) so they fire regardless
of whether any device is awake. Web push uses a custom RFC 8291/8292 VAPID
implementation (`worker/webpush.ts`) with no npm dependencies.

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
- **habit** (§4.10): id, user_id, title, notes, icon, schedule (model:
  `fixed_weekdays` → recurrence_rule | `flexible` → period[week|month] + target
  count), measurement (type[binary|measured], unit?, target_amount?,
  count_done_only_if_target?), time_of_day, alerting (channels, escalate?,
  streak_at_risk?), tags, archived_at, created_at, updated_at, deleted_at
- **habit_log** (§4.10): id, habit_id, user_id, date (local day), state[done|
  skip], amount? (measured), note?, created_at, updated_at, deleted_at
  - "miss" is **derived** (expected day/period with no log), never stored
- **sync metadata**: per-record updated_at / version for last-write-wins

## 8. Tech stack (as built)

- **Frontend**: React 18 + Vite + TypeScript, Dexie (IndexedDB), cmdk, Lucide icons, date-fns
- **UI**: Tailwind CSS v4 (custom token system in `src/index.css`), dark by default
- **PWA**: vite-plugin-pwa (injectManifest), Workbox, Web Push via service worker
- **Backend**: Cloudflare Worker (serves SPA + handles `/api/*` + cron)
- **Database**: Cloudflare D1 (SQLite)
- **AI**: Cloudflare Workers AI (`@cf/meta/llama-3.2-1b-instruct`)
- **Email**: Resend
- **Web Push**: custom RFC 8291/8292 (Web Crypto API, no npm deps)
- **Calendar**: Google Calendar API v3 (OAuth 2.0)

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

## 10. Roadmap

### Shipped ✅
- **v0** — Local core: todos, recurrence, IndexedDB, PWA install
- **v1** — Auth (magic link + password) + email reminders via cron
- **v2** — Git backup to private GitHub repo (debounced + daily cron)
- **v3** — Multi-device sync (push/pull, last-write-wins)
- **v4** — Web push (VAPID, fires with app closed)
- **v5** — AI auto-tagging (Workers AI, filtered to 10 valid categories); tag filter UI
- **v6** — Google Calendar sync (OAuth, event upsert/delete, 06:00 daily agenda block)

### Up next
- **v7 — Habits** (§4.10): habit entity + completion log; fixed-weekday &
  flexible-target schedules; binary & measured tracking; per-habit alerting
  (reuses cron/push); streaks + heatmap + cross-habit weekly/monthly review;
  today's-habits strip atop the main list; backup + sync coverage
- **Snooze** — snooze a reminder (+10 min, +1 hour) from the notification
- **Smart date parsing** — infer due date from natural-language titles
- **Two-way calendar sync** — detect changes made in Google Calendar
- **Encrypted backups** — client-side encryption before git push

### Later / deferred
- SMS reminders (optional, Twilio — paid)
- Lock-screen / home-screen widget
- Sharing / collaboration
