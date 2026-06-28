-- Habits (§4.10): definitions + per-day completion log + cron reminders.
-- Apply to remote D1 with:
--   wrangler d1 execute nudge --remote --file=worker/migrations/0006_habits.sql

CREATE TABLE IF NOT EXISTS habits (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data        TEXT NOT NULL,
  archived_at INTEGER,
  deleted_at  INTEGER,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits (user_id, updated_at);

CREATE TABLE IF NOT EXISTS habit_logs (
  id         TEXT PRIMARY KEY,
  habit_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  data       TEXT NOT NULL,
  date       TEXT NOT NULL,
  deleted_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user ON habit_logs (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs (habit_id);

CREATE TABLE IF NOT EXISTS habit_fires (
  id       TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  date     TEXT NOT NULL,
  kind     TEXT NOT NULL,
  fired_at INTEGER NOT NULL
);
