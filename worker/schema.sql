-- Nudge D1 schema (v1)
-- Server-side copy of todos + derived reminders, plus auth tables.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
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
