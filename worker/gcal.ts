/**
 * Google Calendar sync — one-way (app → Calendar).
 *
 * OAuth flow:
 *   GET /api/auth/google           → redirect to Google consent
 *   GET /api/auth/google/callback  → exchange code, store refresh token, redirect home
 *
 * Sync:
 *   syncCalendar(env, userId, todos) — called after every push.
 *   - Todos with a dueAt get a Calendar event (timed if time is set, all-day otherwise).
 *   - Completed / deleted todos have their event removed.
 *   - calendarEventId is stored in the todo JSON in D1 for idempotent upserts.
 */

import type { Env } from "./index";

const SCOPES = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// ── OAuth helpers ────────────────────────────────────────────────────────────

export function googleAuthUrl(env: Env, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(env),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export function googleRedirectUri(env: Env): string {
  return `${env.APP_URL}/api/auth/google/callback`;
}

export async function exchangeCode(
  env: Env,
  code: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(env),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string }>;
}

async function refreshAccessToken(env: Env, refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Calendar event helpers ───────────────────────────────────────────────────

function toCalendarEvent(todo: CalTodo): object {
  const due = new Date(todo.dueAt!);
  // If the time is midnight UTC we treat it as all-day (date-only).
  const isAllDay =
    due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0;

  const dateStr = due.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dtStr = due.toISOString(); // "YYYY-MM-DDTHH:mm:ssZ"

  return {
    summary: todo.title,
    description: todo.notes ?? undefined,
    ...(isAllDay
      ? { start: { date: dateStr }, end: { date: dateStr } }
      : { start: { dateTime: dtStr }, end: { dateTime: new Date(due.getTime() + 30 * 60000).toISOString() } }),
  };
}

interface CalTodo {
  id: string;
  title: string;
  notes?: string;
  dueAt?: number;
  completedAt?: number;
  deletedAt?: number;
  calendarEventId?: string;
  [k: string]: unknown;
}

async function upsertEvent(accessToken: string, todo: CalTodo): Promise<string> {
  const body = JSON.stringify(toCalendarEvent(todo));
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (todo.calendarEventId) {
    // Update existing event.
    const res = await fetch(`${CAL_BASE}/${encodeURIComponent(todo.calendarEventId)}`, {
      method: "PUT",
      headers,
      body,
    });
    if (res.status === 404) {
      // Event was deleted externally — fall through to create.
    } else if (!res.ok) {
      throw new Error(`event update failed ${res.status}: ${await res.text()}`);
    } else {
      return todo.calendarEventId;
    }
  }

  // Create new event.
  const res = await fetch(CAL_BASE, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`event create failed ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`${CAL_BASE}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status !== 204 && res.status !== 404) {
    throw new Error(`event delete failed ${res.status}`);
  }
}

// ── Main sync ────────────────────────────────────────────────────────────────

export async function syncCalendar(
  env: Env,
  userId: string,
  pushTodos: CalTodo[],
): Promise<void> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;

  // Look up the user's refresh token.
  const row = await env.DB.prepare(
    "SELECT google_refresh_token FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<{ google_refresh_token: string | null }>();
  if (!row?.google_refresh_token) return; // not connected

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(env, row.google_refresh_token);
  } catch (e) {
    console.warn("gcal: token refresh failed:", e);
    return;
  }

  for (const todo of pushTodos) {
    if (!todo.dueAt) continue; // only sync todos with a due date

    try {
      if (todo.deletedAt || todo.completedAt) {
        // Remove from calendar.
        if (todo.calendarEventId) {
          await deleteEvent(accessToken, todo.calendarEventId);
          // Clear the stored event ID.
          await env.DB.prepare(
            "UPDATE todos SET data = json_remove(data, '$.calendarEventId') WHERE id = ? AND user_id = ?",
          )
            .bind(todo.id, userId)
            .run();
        }
      } else {
        // Upsert — create or update.
        const eventId = await upsertEvent(accessToken, todo);
        if (eventId !== todo.calendarEventId) {
          // Persist new event ID back to D1.
          const existing = await env.DB.prepare(
            "SELECT data FROM todos WHERE id = ? AND user_id = ?",
          )
            .bind(todo.id, userId)
            .first<{ data: string }>();
          if (existing) {
            const data = JSON.parse(existing.data) as CalTodo;
            await env.DB.prepare("UPDATE todos SET data = ? WHERE id = ? AND user_id = ?")
              .bind(JSON.stringify({ ...data, calendarEventId: eventId }), todo.id, userId)
              .run();
          }
        }
      }
    } catch (e) {
      console.warn(`gcal: failed to sync todo ${todo.id}:`, e);
    }
  }

  console.log(`gcal: synced ${pushTodos.filter((t) => t.dueAt).length} todos`);
}
