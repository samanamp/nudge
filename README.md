# Nudge

> It nudges until it's done.

Offline-first, local-first todo app with time-sensitive reminders and flexible
recurrence. Crisp & dense (Linear-style) UI, mobile + desktop. See
[`REQUIREMENTS.md`](./REQUIREMENTS.md) for the full spec and roadmap.

**Status: v1 — backend foundation.** v0 offline core **plus** a Cloudflare
Worker + D1: passwordless magic-link auth, one-way push of todos to the server,
email reminders via cron, and in-app browser notifications while open. Multi-
device sync, web push, AI, and calendar are later milestones (see
`REQUIREMENTS.md`).

## Run (frontend only — offline core)

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # recurrence engine tests
npm run typecheck
```

## Run with the backend (auth + reminders)

```bash
cp .dev.vars.example .dev.vars      # then fill in AUTH_SECRET + RESEND_API_KEY
npm run db:init                     # apply schema to LOCAL D1
npm run worker:dev                  # Worker + API on http://localhost:8787
npm run dev                         # Vite on :5173, proxies /api → :8787
```

Open http://localhost:5173, sign in with your email, click the link.

## Deploy (Cloudflare, free tier)

```bash
wrangler login
wrangler d1 create nudge            # paste the database_id into wrangler.jsonc
npm run db:init:remote              # apply schema to remote D1
wrangler secret put AUTH_SECRET     # a long random string
wrangler secret put RESEND_API_KEY  # from resend.com
# set EMAIL_FROM + APP_URL in wrangler.jsonc "vars" (APP_URL = your deployed URL)
npm run deploy                      # builds the PWA + deploys the Worker
```

> **Email:** with Resend's shared `onboarding@resend.dev` sender you can only
> email **your own** Resend account address. To send anywhere, verify a domain
> at resend.com/domains and set `EMAIL_FROM` to an address on it.

## Stack

- React + Vite + TypeScript, Tailwind CSS v4 (tokens in `src/index.css`)
- Dexie (IndexedDB) — local source of truth, `src/lib/db.ts`
- cmdk command palette, Lucide icons, date-fns
- vite-plugin-pwa (offline cache + manifest)
- **Backend:** Cloudflare Worker (`worker/`) + D1 + cron, Resend email

## Layout

```
src/
  lib/
    types.ts        domain model (Todo, Reminder, RecurrenceRule)
    db.ts           Dexie store + create/update/complete/delete
    recurrence.ts   next-occurrence engine (+ tests)
    grouping.ts     Overdue / Today / Upcoming / No date / Completed
    dates.ts        due-date formatting & composition
    api.ts          client → Worker API (auth + push)
    session.ts      useSession + debounced usePushSync
    reminderSchedule.ts  client-side absolute fire-time computation (local tz)
    notify.ts       in-app browser notifications while open
  components/
    App / TodoRow / QuickAdd / EditDialog / ReminderEditor / CommandPalette
    AccountMenu     sign-in / account / enable-notifications

worker/
  index.ts          router (/api/*) + scheduled() cron
  auth.ts           magic-link issue/consume + session cookies
  jwt.ts            HMAC-signed session tokens (no deps)
  reminders.ts      cron: fire due reminders, roll nags forward
  email.ts          Resend client + email templates
  schema.sql        D1 schema
```

## Keyboard (desktop)

`⌘K` command palette · `↑/↓` (or `j/k`) move · `⏎` open · `X` complete · `N` new task
