-- Store Google OAuth refresh token per user for Calendar sync.
ALTER TABLE users ADD COLUMN google_refresh_token TEXT;
