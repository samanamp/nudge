-- Per-user state for the daily agenda Calendar event.
ALTER TABLE users ADD COLUMN timezone TEXT;
ALTER TABLE users ADD COLUMN google_agenda_event_id TEXT;
ALTER TABLE users ADD COLUMN google_agenda_date TEXT;
