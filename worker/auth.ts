import type { Env } from "./index";
import { signSession, verifySession } from "./jwt";
import { magicLinkEmail, sendEmail } from "./email";

const COOKIE = "nudge_session";
const TOKEN_TTL_MS = 15 * 60 * 1000;

const newId = () =>
  crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

/** Create + email a magic link. Always returns ok (don't leak who has an account). */
export async function requestMagicLink(env: Env, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("bad email");

  const token = newId();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO magic_tokens (token, email, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)",
  )
    .bind(token, normalized, now + TOKEN_TTL_MS, now)
    .run();

  const link = `${env.APP_URL}/api/auth/callback?token=${token}`;
  await sendEmail(env, { to: normalized, ...magicLinkEmail(link) });
}

/** Verify a magic token, upsert the user, return their email or null. */
export async function consumeMagicLink(
  env: Env,
  token: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT email, expires_at, used FROM magic_tokens WHERE token = ?",
  )
    .bind(token)
    .first<{ email: string; expires_at: number; used: number }>();

  if (!row || row.used || row.expires_at < Date.now()) return null;

  await env.DB.prepare("UPDATE magic_tokens SET used = 1 WHERE token = ?")
    .bind(token)
    .run();

  // Upsert user.
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(row.email)
    .first<{ id: string }>();
  if (!existing) {
    await env.DB.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
    )
      .bind(newId(), row.email, Date.now())
      .run();
  }
  return row.email;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
    60 * 60 * 24 * 30
  }`;
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function makeSession(env: Env, email: string): Promise<string> {
  return signSession(email, env.AUTH_SECRET);
}

/** Return the signed-in user's email, or null. */
export async function currentUser(
  env: Env,
  req: Request,
): Promise<string | null> {
  const cookie = req.headers.get("Cookie") ?? "";
  const match = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!match) return null;
  const payload = await verifySession(match[1], env.AUTH_SECRET);
  return payload?.sub ?? null;
}

/** Resolve a user's id from their email. */
export async function userIdForEmail(
  env: Env,
  email: string,
): Promise<string | null> {
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  return row?.id ?? null;
}

// ── Password auth (PBKDF2 via Web Crypto) ──────────────────────────────

const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(pw: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pw) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: iter, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pw, salt, 100_000);
  return `pbkdf2$100000$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const got = await pbkdf2(pw, fromB64(salt), Number(iter));
  const want = fromB64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

interface UserRow {
  id: string;
  password_hash: string | null;
}

export async function getUser(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
}

/** Create a user (or set a password on a passwordless one). Returns false on conflict. */
export async function registerPassword(
  env: Env,
  email: string,
  password: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return false;
  if (password.length < 8) return false;

  const hash = await hashPassword(password);
  const existing = await getUser(env, normalized);
  if (existing) {
    if (existing.password_hash) return false; // already has a password
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(hash, existing.id)
      .run();
    return true;
  }
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(newId(), normalized, hash, Date.now())
    .run();
  return true;
}
