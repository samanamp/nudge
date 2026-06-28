-- Nudge D1 schema (v1)
-- Server-side copy of todos + derived reminders, plus auth tables.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_at    INTEGER NOT NULL
);

-- Single-use, short-lived magic-link tokens.
CREATE TABLE IF NOT EXISTS magic_tokens (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_magic_expires ON magic_tokens (expires_at);

-- Full todo snapshot (JSON in `data`) + columns used for queries/sorting.
CREATE TABLE IF NOT EXISTS todos (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  data         TEXT NOT NULL,
  due_at       INTEGER,
  completed_at INTEGER,
  deleted_at   INTEGER,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos (user_id, updated_at);

-- Derived, per-fire reminder schedule. The cron scans this table.
CREATE TABLE IF NOT EXISTS reminders (
  id           TEXT PRIMARY KEY,
  todo_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  type         TEXT NOT NULL,             -- one_shot | recurring
  channels     TEXT NOT NULL,            -- json array, e.g. ["email","push"]
  title        TEXT NOT NULL,            -- denormalized for the email
  notes        TEXT,
  due_at       INTEGER,
  cadence_days INTEGER,                  -- recurring only
  stop         TEXT,                     -- recurring: on_complete | at_due
  next_fire_at INTEGER NOT NULL,
  last_fired_at INTEGER,
  status       TEXT NOT NULL DEFAULT 'scheduled' -- scheduled | done
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (status, next_fire_at);
CREATE INDEX IF NOT EXISTS idx_reminders_todo ON reminders (todo_id);

-- Habits (§4.10): full JSON snapshot + columns for querying. Mirrors `todos`.
CREATE TABLE IF NOT EXISTS habits (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data        TEXT NOT NULL,
  archived_at INTEGER,
  deleted_at  INTEGER,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits (user_id, updated_at);

-- Append-mostly per-day completion log. One row per habit per local day.
CREATE TABLE IF NOT EXISTS habit_logs (
  id         TEXT PRIMARY KEY,
  habit_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  data       TEXT NOT NULL,
  date       TEXT NOT NULL,             -- local day "YYYY-MM-DD"
  deleted_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user ON habit_logs (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs (habit_id);

-- Per-day fire log so the 5-min cron sends each habit nudge at most once a day.
-- The id `${habit_id}:${date}:${kind}` makes a duplicate fire a no-op insert.
CREATE TABLE IF NOT EXISTS habit_fires (
  id       TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  date     TEXT NOT NULL,               -- local day "YYYY-MM-DD"
  kind     TEXT NOT NULL,               -- nudge | escalate | streak_risk
  fired_at INTEGER NOT NULL
);
