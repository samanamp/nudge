CREATE TABLE IF NOT EXISTS push_subscriptions (
  id        TEXT    PRIMARY KEY,
  user_id   TEXT    NOT NULL,
  endpoint  TEXT    NOT NULL,
  p256dh    TEXT    NOT NULL,
  auth      TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, endpoint)
);
