# CLAUDE.md — Nudge codebase guide for AI agents

## What this is

Nudge is a personal offline-first **todo + habit** PWA. Single user. The React
frontend stores all state in IndexedDB (Dexie) and syncs to a Cloudflare Worker
+ D1 backend. Live at https://nudge.edge.bond.

Two feature halves, switched by a tab in the header:
- **Todos** — time-sensitive tasks, recurrence, reminders/nags, AI tags, calendar sync.
- **Habits** (§4.10 in REQUIREMENTS.md) — recurring practices (yoga, meditation,
  violin) tracked for consistency: streaks, heatmap, completion %, per-habit
  nudges. A habit is a *separate entity* from a todo, with an append-only
  completion log — the whole point is history over time, not one-off completion.

## Commands

```bash
npm run dev              # Vite frontend on :5173
npm run worker:dev       # Cloudflare Worker on :8787 (proxied from :5173)
npm run typecheck        # frontend tsc --noEmit
npm run typecheck:worker # worker tsc -p worker/tsconfig.json
npm test                 # vitest — recurrence engine unit tests
npm run deploy           # vite build + wrangler deploy (production)
npm run db:init          # apply schema.sql to local D1
npm run db:init:remote   # apply schema.sql to remote D1
```

**Always run `npm run typecheck && npm run typecheck:worker` before deploying.**

## Architecture

```
Browser (IndexedDB / Dexie)
  ↕ debounced push + pull on login
Cloudflare Worker (worker/index.ts)
  ├── /api/auth/*     — magic-link + password auth, session cookies
  ├── /api/todos/*    — push (client→server) + pull (server→client)
  ├── /api/habits/*   — push (habits+logs) + pull; AI emoji in push response
  ├── /api/push/*     — VAPID key, subscribe, unsubscribe
  ├── /api/auth/google/* — Google Calendar OAuth + status + disconnect
  └── scheduled()    — cron every 5 min: fire due reminders + habit nudges,
                       update agendas
Cloudflare D1 (SQLite)
  tables: users, todos, reminders, push_subscriptions, google_tokens, agendas,
          habits, habit_logs, habit_fires
```

The frontend is an SPA served by Cloudflare Worker Assets (`ASSETS: Fetcher`).
`run_worker_first: ["/api/*"]` in `wrangler.jsonc` ensures API routes hit the
Worker; everything else is served from `dist/`.

## Key files

| File | Purpose |
|---|---|
| `src/lib/types.ts` | `Todo`, `Reminder`, `RecurrenceRule`, **`Habit`, `HabitLog`** — canonical domain types |
| `src/lib/db.ts` | Dexie schema (v2: `todos`, `habits`, `habitLogs`), `normalizeTodo`, todo CRUD, `toggleComplete` |
| `src/lib/habits.ts` | Habit CRUD + per-day logging (`logHabit`/`toggleDone`/`clearLog`), `dayKey`, `describeSchedule`, sync-merge, `assignEmoji` integration |
| `src/lib/habitStats.ts` | **Pure** streak/completion/period/heatmap engine (fixed + flexible, binary + measured). Unit-tested |
| `src/lib/emoji.ts` | `matchEmoji`/`guessEmoji`/`assignEmoji` — curated keyword→emoji map + collision avoidance |
| `src/lib/session.ts` | `useSession`, `usePushSync` (todos), `usePushHabits`, `usePullOnLogin` (pulls todos+habits), `useOnlineStatus` |
| `src/lib/recurrence.ts` | `nextOccurrence()` engine — all recurrence logic lives here |
| `src/lib/grouping.ts` | `groupTodos()` → Overdue / Today / Upcoming / Someday / Done |
| `src/lib/dates.ts` | `formatDue`, `taskAge`, `composeDue` |
| `src/lib/notify.ts` | `requestAndSubscribePush`, `unsubscribePush`, `useInAppReminders` |
| `src/lib/useTheme.ts` | Theme system: `THEMES` list, `useTheme()` → `{ theme, setTheme, cycle }` |
| `src/lib/pwa.ts` | Service-worker registration + `checkForUpdate()` (drives the sync-button update check) |
| `src/App.tsx` | Root component: Todos/Habits tabs, layout, keyboard nav, tag filter, completion animation, undo toast |
| `src/components/Logo.tsx` | `LogoGlyph` — the "n" monogram brand mark (animated ping on sign-in) |
| `src/components/ThemeMenu.tsx` | Header theme picker (swatches) |
| `src/components/Habit*.tsx` | `HabitsView`, `HabitCard`, `HabitHeatmap`, `HabitEditDialog`, `TodayHabits` |
| `worker/index.ts` | Fetch router — all `/api/*` routes (`pushTodos`, `pushHabits`, emoji) + `scheduled()` |
| `worker/auth.ts` | Session JWTs, magic links, password hashing |
| `worker/reminders.ts` | Cron: query due todo reminders, send email + web push, roll nags |
| `worker/habitReminders.ts` | Cron: timezone-correct habit nudges (once/day via `habit_fires` dedup) |
| `worker/gcal.ts` | Google Calendar sync — event upsert/delete + daily agenda block |
| `worker/ai.ts` | Workers AI tag suggestion (10 categories) + `suggestEmoji` (curated-first) |
| `worker/webpush.ts` | Pure Web Crypto RFC 8291/8292 VAPID push — no npm deps |
| `worker/backup.ts` | GitHub REST API snapshot push (todos + habits + logs) |
| `worker/schema.sql` | Full D1 schema (apply with `db:init` / `db:init:remote`) |
| `worker/migrations/*.sql` | Incremental migrations — **applied manually** (see pitfalls) |

## Data flow: creating a task

1. `QuickAdd` calls `createTodo(db, title)` → inserts into IndexedDB
2. `usePushSync` detects the change (Dexie live query), debounces 800ms, calls `POST /api/todos/push`
3. Worker inserts/updates the todo row in D1, writes reminders, triggers `syncCalendar` and `suggestTags` in `ctx.waitUntil`
4. AI tag suggestions come back in the push response and are merged into IndexedDB
5. Google Calendar event is created/updated in the background

## Sync model

- **Push** (`POST /api/todos/push`): client sends its full local array; server upserts. Last-write-wins on `updatedAt`.
- **Pull** (`GET /api/todos/pull`): server returns all non-deleted rows. Called once on login.
- **calendarEventId** race: client may push before pulling (stale/missing `calendarEventId`). `syncCalendar` batch-queries D1 first to get the authoritative id before deciding create vs update.
- Soft-deletes: `deletedAt` timestamp acts as tombstone; never hard-deleted from D1.

## Habits (§4.10)

A **habit** is a separate entity from a todo; its value is the **append-only
`HabitLog`** (one row per local day, `done` or `skip`). "miss" is *derived*, never
stored. Two orthogonal axes per habit:

- **Schedule**: `fixed_weekdays` (e.g. Mon/Wed/Fri) or `flexible` (N×/week|month).
- **Measurement**: `binary` (done/not) or `measured` (amount + unit + target).

Rules baked into `src/lib/habitStats.ts` (all pure, unit-tested):
- `skip` is transparent to streaks; today not-yet-done is in *grace* (never a miss).
- Days **before `habit.createdAt`** are not misses (heatmap shows them empty; completion % is measured since creation).
- `countDoneOnlyIfTarget` lets a measured habit only count when amount ≥ target.

Sync: `usePushHabits` debounce-pushes the full local habits+logs arrays (incl.
tombstones) to `POST /api/habits/push`; `usePullOnLogin` also pulls them. Server
upserts last-write-wins. The push response returns AI-suggested emojis for any
iconless habit (curated map first, AI fallback) which the client merges.

Alerting: `worker/habitReminders.ts` runs in the 5-min cron. It evaluates each
habit against the user's **local** clock (via `Intl` + stored timezone) and fires
a once-daily push/email nudge if it's at/after the habit's time on an expected
day and unlogged. `habit_fires` (PK `${habit}:${date}:nudge`) dedups across cron
runs — no per-occurrence schedule rows. Flexible habits stop once the period
target is met.

UI: habits live on the **Habits tab** (`HabitsView`); today's due habits also show
as a strip atop the Todos list (`TodayHabits`). Logging an already-done habit
opens an actions row (edit/clear) rather than silently un-logging.

## Themes

`useTheme()` applies a single `theme-<id>` class to `<html>` and persists it.
Themes: `dark` (Midnight, default), `light` (Daylight), `homebrew`, `amber`,
`dracula`. Each is a full token override block in `src/index.css`
(`:root.theme-<id> { … }`); the base `@theme` block is the dark default. Picker
is `ThemeMenu` (header); `⌘K → Next theme` cycles.

- **Homebrew** is a rich ANSI terminal theme: green-on-black + cyan/amber/red
  accents, body font switched to mono (`--font-sans: var(--font-mono)`), and
  tags get *varied* ANSI hues via the `--ansi-*` vars (defined only here). Tags
  read those vars with a fallback to `--color-accent-text`, so only Homebrew is
  multi-color — see `tagColor()` in `TodoRow.tsx`.
- All themes pass WCAG AA (audited). When changing accent/text tokens, re-check
  contrast (white-on-accent buttons + accent-on-tint tags are the tight ones).

## PWA updates & icons

- **Updates**: `registerType: "prompt"` + `injectRegister: false`; we register in
  `src/lib/pwa.ts` and auto-apply. `src/sw.ts` handles a `SKIP_WAITING` message
  (+ `clientsClaim`) — **required for injectManifest**, or new builds stay
  "waiting" and refreshes serve the stale shell. The header sync button calls
  `checkForUpdate()` so users can force a refresh.
- **Icons**: iOS Add-to-Home-Screen ignores SVG + manifest, so PNGs are required:
  `public/apple-touch-icon.png` (180, linked in `index.html`) + `icon-192/512.png`
  in the manifest (`vite.config.ts`). Regenerate from the monogram by rendering
  the gradient + `LogoGlyph` SVG to PNG (headless Chrome) if the mark changes.

## AI tags

Valid vocabulary (enforced in `worker/ai.ts` post-processing):
```
errand, health, finance, work, home, shopping, personal, travel, family, fitness
```
The 1B model doesn't reliably follow "only use these" prompts, so output is filtered
with a `Set` after parsing. Any tag not in this set is discarded.

## Notification flow

1. User clicks "Enable notifications" in AccountMenu
2. `requestAndSubscribePush()` in `src/lib/notify.ts`:
   - Calls `Notification.requestPermission()`
   - Fetches VAPID public key from `/api/push/key`
   - Calls `pushManager.subscribe()` with 8-second SW-ready timeout
   - POSTs `{ endpoint, p256dh, auth }` to `/api/push/subscribe`
3. Cron in `worker/reminders.ts` (todos) and `worker/habitReminders.ts` (habits)
   queries `push_subscriptions` and calls `sendWebPush()`
4. Service worker (`src/sw.ts`) receives the push event and calls `showNotification()`

**VAPID key format**: `VAPID_PUBLIC_KEY` must be raw base64url (no surrounding quotes).
`VAPID_PRIVATE_KEY` must be a JSON string of a JWK (`{"kty":"EC",...}`). Both are
stripped of accidental surrounding quotes in `worker/index.ts` and `worker/webpush.ts`.

## Secrets

Stored as wrangler secrets (`wrangler secret put <NAME>`). Never commit `.dev.vars`.

| Secret | Format |
|---|---|
| `AUTH_SECRET` | Any long random string |
| `RESEND_API_KEY` | `re_...` from resend.com |
| `VAPID_PUBLIC_KEY` | Raw base64url P-256 public key (~87 chars) |
| `VAPID_PRIVATE_KEY` | JWK JSON string for P-256 private key |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GITHUB_BACKUP_PAT` | Fine-grained PAT, write scope on backup repo only |

## Styling conventions

- Tailwind CSS v4 — design tokens in `src/index.css` under `@theme` (= dark default)
- **Themes**: `:root.theme-<id>` blocks override the token set (see Themes above)
- `color-scheme` is set per theme so native date/time pickers + scrollbars match
- Custom properties: `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-dim`, `--color-text-faint`, `--color-accent`, `--color-accent-2`, `--color-accent-text` (lighter accent for small text/tags), `--color-accent-fg`, `--color-danger`
- `.control` class in `index.css` — shared style for `<input>` / `<select>` in forms
- Keyboard focus ring: global `:focus-visible` outline on buttons/links only (NOT inputs — they have their own focus styles; a box outline looks wrong on underline fields)
- `cn()` from `src/lib/cn.ts` — clsx + tailwind-merge
- Fonts: Space Grotesk (display), Inter (sans), JetBrains Mono (mono) — loaded in `index.html`

## Testing

Unit tests cover the two pure engines: recurrence (`src/lib/recurrence.test.ts`)
and habit stats (`src/lib/habitStats.test.ts`). Run with `npm test`. Everything
else relies on type-checking + manual testing.

**Visual QA via headless screenshots**: the workflow used throughout development
is a throwaway `src/preview/HabitsPreview.tsx` harness (rendered when `?preview`
is in the URL, wired in `main.tsx`) that seeds IndexedDB with mock data and
renders real components without auth, plus a Playwright script (`channel:
"chrome"`) that screenshots at desktop/mobile × themes. Recreate it when you need
to *see* a change; delete it (and revert the `main.tsx` branch) before shipping.

## Common pitfalls

- **Wrangler secrets with surrounding quotes**: if you enter `"value"` at the
  `wrangler secret put` prompt, the quotes are stored literally. The code strips
  them defensively, but prefer entering the raw value.
- **D1 migrations**: `schema.sql` is additive. Run migrations in `worker/migrations/`
  against remote D1 manually with `wrangler d1 execute nudge --remote --file=...`.
  They are NOT applied automatically. Latest: `0006_habits.sql` (habits,
  habit_logs, habit_fires) — already applied to remote + local.
- **iOS home-screen icon**: must be a PNG `apple-touch-icon` (SVG/manifest are
  ignored by iOS). iOS caches it hard — remove the old home-screen icon and
  hard-reload to see a new one.
- **SW update needs SKIP_WAITING**: with `injectManifest`, `src/sw.ts` must handle
  the `SKIP_WAITING` message or new builds never activate. Don't remove it.
- **Dexie is per-browser**: habit/todo data created in Chrome isn't in Edge until
  it round-trips through the server (push → pull). Not a bug — sync timing.
- **`navigator.serviceWorker.ready` can hang**: the push subscribe flow has an 8s
  timeout; if you see "Service worker not ready", reload the page after the first
  deploy so the SW installs.
- **Google OAuth redirect URI**: must include `https://nudge.edge.bond/api/auth/google/callback`
  in the Google Cloud Console authorized redirect URIs list.
- **Tag filter clears on quick-add**: `handleCreated` in `App.tsx` clears `activeTag`
  so a newly created task is always visible.
</content>
</invoke>