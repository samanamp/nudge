# CLAUDE.md — Nudge codebase guide for AI agents

## What this is

Nudge is a personal offline-first todo PWA. Single user. The React frontend
stores all state in IndexedDB (Dexie) and syncs to a Cloudflare Worker + D1
backend. Live at https://nudge.edge.bond.

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
  ├── /api/push/*     — VAPID key, subscribe, unsubscribe
  ├── /api/auth/google/* — Google Calendar OAuth + status + disconnect
  └── scheduled()    — cron every 5 min: fire due reminders, update agendas
Cloudflare D1 (SQLite)
  tables: users, todos, reminders, push_subscriptions, google_tokens, agendas
```

The frontend is an SPA served by Cloudflare Worker Assets (`ASSETS: Fetcher`).
`run_worker_first: ["/api/*"]` in `wrangler.jsonc` ensures API routes hit the
Worker; everything else is served from `dist/`.

## Key files

| File | Purpose |
|---|---|
| `src/lib/types.ts` | `Todo`, `Reminder`, `RecurrenceRule` — the canonical domain types |
| `src/lib/db.ts` | Dexie schema, `normalizeTodo`, `createTodo`, `updateTodo`, `deleteTodo`, `toggleComplete` |
| `src/lib/session.ts` | `useSession`, `usePushSync` (debounced push), `usePullOnLogin`, `useOnlineStatus` |
| `src/lib/recurrence.ts` | `nextOccurrence()` engine — all recurrence logic lives here |
| `src/lib/grouping.ts` | `groupTodos()` → Overdue / Today / Upcoming / Someday / Done |
| `src/lib/dates.ts` | `formatDue`, `taskAge`, `composeDue` |
| `src/lib/notify.ts` | `requestAndSubscribePush`, `unsubscribePush`, `useInAppReminders` |
| `src/components/App.tsx` | Root component: layout, keyboard nav, tag filter, flash, undo toast |
| `worker/index.ts` | Fetch router — all `/api/*` routes + `scheduled()` |
| `worker/auth.ts` | Session JWTs, magic links, password hashing |
| `worker/reminders.ts` | Cron job: query due reminders, send email + web push, roll nags |
| `worker/gcal.ts` | Google Calendar sync — event upsert/delete + daily agenda block |
| `worker/ai.ts` | Workers AI tag suggestion; output filtered to the 10 valid categories |
| `worker/webpush.ts` | Pure Web Crypto RFC 8291/8292 VAPID push — no npm deps |
| `worker/backup.ts` | GitHub REST API snapshot push |
| `worker/schema.sql` | Full D1 schema (apply with `db:init` / `db:init:remote`) |

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
3. Cron in `worker/reminders.ts` queries `push_subscriptions` and calls `sendWebPush()`
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

- Tailwind CSS v4 — design tokens in `src/index.css` under `@theme`
- Dark by default; `:root.light` overrides the token set
- `color-scheme: dark` / `light` on `:root` fixes native date/time pickers
- Custom properties: `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-dim`, `--color-text-faint`, `--color-accent`, `--color-danger`
- `.control` class in `index.css` — shared style for `<input>` / `<select>` in forms
- `cn()` from `src/lib/cn.ts` — clsx + tailwind-merge

## Testing

Only the recurrence engine has unit tests (`src/lib/recurrence.test.ts`). Run with
`npm test`. Everything else relies on type-checking + manual testing.

## Common pitfalls

- **Wrangler secrets with surrounding quotes**: if you enter `"value"` at the
  `wrangler secret put` prompt, the quotes are stored literally. The code strips
  them defensively, but prefer entering the raw value.
- **D1 migrations**: `schema.sql` is additive. Run migrations in `worker/migrations/`
  against remote D1 manually with `wrangler d1 execute nudge --remote --file=...`.
  They are NOT applied automatically.
- **`navigator.serviceWorker.ready` can hang**: the push subscribe flow has an 8s
  timeout; if you see "Service worker not ready", reload the page after the first
  deploy so the SW installs.
- **Google OAuth redirect URI**: must include `https://nudge.edge.bond/api/auth/google/callback`
  in the Google Cloud Console authorized redirect URIs list.
- **Tag filter clears on quick-add**: `handleCreated` in `App.tsx` clears `activeTag`
  so a newly created task is always visible.
</content>
</invoke>