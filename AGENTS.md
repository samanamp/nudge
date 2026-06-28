# AGENTS.md

This project's agent/contributor guide lives in **[CLAUDE.md](./CLAUDE.md)** —
read it first. It covers architecture, key files, the todo + habit data models,
themes, sync, the cron jobs, PWA/update gotchas, and common pitfalls.

Product requirements (the "why" + roadmap) are in **[REQUIREMENTS.md](./REQUIREMENTS.md)**.

## TL;DR for picking up work

- **Stack**: React + Vite + Dexie (IndexedDB) frontend; Cloudflare Worker + D1
  backend; offline-first, single user. Live at https://nudge.edge.bond.
- **Before deploying**: `npm run typecheck && npm run typecheck:worker && npm test`.
- **Deploy**: `npm run deploy` (build + `wrangler deploy`). Outward-facing — get
  the user's OK first.
- **D1 migrations are manual** — `worker/migrations/*.sql` via
  `wrangler d1 execute nudge --remote --file=…`. Latest is `0006_habits.sql`.
- **Two pure, tested engines**: `src/lib/recurrence.ts` and `src/lib/habitStats.ts`.
  Keep them pure and add tests when you touch them.
- **Visual changes**: verify with the throwaway `?preview` harness + Playwright
  screenshots (see CLAUDE.md → Testing), then delete it before shipping.
