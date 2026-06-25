-- Add password auth to existing users table.
-- Safe to ignore "duplicate column" if already applied.
ALTER TABLE users ADD COLUMN password_hash TEXT;
