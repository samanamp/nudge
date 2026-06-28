# Nudge

> It nudges until it's done.

Offline-first, local-first **todo + habit** app. Crisp & dense (Linear-style) UI,
works on mobile and desktop, installable as a PWA. Live at **[nudge.edge.bond](https://nudge.edge.bond)**.

## Features

- **Offline-first** — full functionality with no internet; syncs automatically when back online
- **Multi-device sync** — same todos + habits on every signed-in device
- **Recurring todos** — daily, weekly (specific weekdays), monthly, yearly, every N units
- **Reminders** — one-shot offsets ("1 hour before") and recurring nags ("every day until done"); delivered via **email** and **web push** (fires even when the app is closed)
- **Habit tracking** — recurring practices (yoga, meditation, violin) with streaks, a GitHub-style heatmap, completion %, and cross-habit weekly review. Fixed-day or N×/period schedules; done/not or measured (e.g. minutes). Per-habit nudges via the same email/push pipeline
- **AI auto-tagging + emoji** — Workers AI suggests up to 3 tags on tasks, and an emoji for new habits
- **Tag filter** — click any tag pill to filter; header updates count
- **Google Calendar sync** — todos with due dates appear as calendar events; daily agenda block at 06:00
- **Git backup** — full snapshot (todos + habits + logs) pushed to a private GitHub repo after every sync + daily cron
- **Password or magic link** — sign in with a password or request a one-click email link
- **Themes** — Midnight (default), Daylight, Homebrew (terminal), Amber CRT, Dracula — picker in the header
- **Command palette** — `⌘K` for everything
- **Keyboard nav** — `↑/↓`, `⏎`, `X`, `N` on desktop; satisfying completion animation

## Dev setup

```bash
npm install
npm run dev          # Vite frontend only — http://localhost:5173
npm test             # recurrence engine unit tests
npm run typecheck    # frontend TypeScript check
npm run typecheck:worker  # worker TypeScript check
```

### With the full backend (auth + reminders + sync)

```bash
cp .dev.vars.example .dev.vars   # fill in secrets (see below)
npm run db:init                  # apply schema.sql to local D1
npm run worker:dev               # Worker on :8787
npm run dev                      # Vite on :5173, proxies /api → :8787
```

Open http://localhost:5173, sign in, done.

## Deploy

```bash
wrangler login
wrangler d1 create nudge                    # paste database_id into wrangler.jsonc
npm run db:init:remote                      # apply schema to remote D1
npm run deploy                              # vite build + wrangler deploy
```

### Required secrets (`wrangler secret put <NAME>`)

| Secret | Description |
|---|---|
| `AUTH_SECRET` | Long random string for signing session JWTs |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) — for email delivery |
| `VAPID_PUBLIC_KEY` | Base64url uncompressed P-256 public key for Web Push |
| `VAPID_PRIVATE_KEY` | JWK JSON string for the corresponding private key |

### Optional secrets

| Secret | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID for Google Calendar sync |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GITHUB_BACKUP_PAT` | Fine-grained GitHub PAT (write to backup repo only) |

> **VAPID keys** — generate with `npx web-push generate-vapid-keys`. Store the
> raw output values **without surrounding quotes**. The public key goes to the
> browser as `applicationServerKey`; the private key must be a JWK JSON string
> (use `npx web-push generate-vapid-keys --json` and store the `privateKey` JWK field).

> **Email** — with Resend's shared sender you can only email your own Resend
> address. Verify a domain at resend.com and set `EMAIL_FROM` in `wrangler.jsonc`
> to send anywhere.

> **Google Calendar** — add `https://<your-domain>/api/auth/google/callback` to
> the Authorized Redirect URIs in [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS v4 (tokens in `src/index.css`) |
| Local data | Dexie (IndexedDB) — offline source of truth |
| UI libs | cmdk, Lucide icons, date-fns |
| PWA | vite-plugin-pwa (offline cache, manifest, push receive) |
| Backend | Cloudflare Worker (Worker Assets serving the SPA + `/api/*`) |
| Database | Cloudflare D1 (SQLite) |
| Cron | Cloudflare Cron Triggers — every 5 min for due reminders |
| AI | Cloudflare Workers AI (`@cf/meta/llama-3.2-1b-instruct`) |
| Email | Resend |
| Web Push | Custom RFC 8291 / RFC 8292 implementation in `worker/webpush.ts` |

## Project layout

```
src/
  lib/
    types.ts              Todo, Reminder, RecurrenceRule domain types
    db.ts                 Dexie schema + create/update/complete/delete/purge
    recurrence.ts         Next-occurrence engine (tested)
    recurrence.test.ts    Vitest unit tests
    grouping.ts           Overdue / Today / Upcoming / Someday / Done groups
    dates.ts              Due-date formatting, taskAge() aging signal
    session.ts            useSession, usePushSync, usePullOnLogin, useOnlineStatus
    reminderSchedule.ts   Client-side absolute fire-time computation (local tz)
    notify.ts             requestAndSubscribePush, useInAppReminders
    useTheme.ts           Dark/light theme persistence
    api.ts                Typed fetch wrappers
    cn.ts                 clsx + tailwind-merge helper
  components/
    App.tsx               Root: layout, keyboard nav, tag filter, toasts
    TodoRow.tsx           Row with checkbox, tags, aging signal, due badge
    QuickAdd.tsx          Single-field fast-add (desktop + mobile sticky)
    EditDialog.tsx        Full edit sheet: title, notes, date/time, tags, recurrence, reminders
    ReminderEditor.tsx    One-shot + recurring nag reminder builder
    CommandPalette.tsx    ⌘K palette (cmdk)
    AccountMenu.tsx       Desktop dropdown / mobile sheet: account, notifications, calendar
    Checkbox.tsx          44px touch-target circle checkbox
    SignInScreen.tsx      Sign-in / sign-up form
    SignInForm.tsx        Email + password fields + magic-link toggle

worker/
  index.ts              Fetch router (/api/*) + scheduled() cron entry
  auth.ts               Magic-link issue/consume, password hash, session cookies
  jwt.ts                HMAC-SHA256 session tokens (no external deps)
  reminders.ts          Cron: fire due reminders, roll recurring nags forward
  email.ts              Resend client + email templates
  webpush.ts            RFC 8291 aes128gcm encrypt + RFC 8292 VAPID JWT (Web Crypto)
  ai.ts                 Workers AI tag suggestion + VALID tag vocabulary filter
  gcal.ts               Google Calendar OAuth + event upsert/delete + daily agenda
  backup.ts             GitHub REST API snapshot push
  schema.sql            D1 schema (users, todos, reminders, push_subscriptions, …)
  migrations/           Incremental schema additions (applied manually with db:init:remote)
```

## Keyboard shortcuts (desktop)

| Key | Action |
|---|---|
| `⌘K` | Command palette |
| `N` | Focus quick-add |
| `↑` / `↓` or `J` / `K` | Move selection |
| `⏎` | Open selected task |
| `X` or `Space` | Toggle complete |
| `⌘↵` | Save (in edit dialog) |
| `Esc` | Close dialog / menu |
</content>
</invoke>