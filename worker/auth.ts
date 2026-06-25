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
