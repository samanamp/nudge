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

  // Batch-fetch D1's current data for all pushed todos with a due date.
  // D1 is authoritative for calendarEventId — the push payload may not have it
  // yet if the client hasn't pulled since the last sync.
  const ids = pushTodos.filter((t) => t.dueAt).map((t) => t.id);
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  const d1Rows = await env.DB.prepare(
    `SELECT id, data FROM todos WHERE id IN (${placeholders}) AND user_id = ?`,
  )
    .bind(...ids, userId)
    .all<{ id: string; data: string }>();

  const d1Map = new Map(
    (d1Rows.results ?? []).map((r) => [r.id, JSON.parse(r.data) as CalTodo]),
  );

  for (const todo of pushTodos) {
    if (!todo.dueAt) continue;

    // Merge: D1's calendarEventId wins over the push payload (avoids duplicates).
    const d1Data = d1Map.get(todo.id);
    const merged: CalTodo = { ...todo, calendarEventId: d1Data?.calendarEventId ?? todo.calendarEventId };

    try {
      if (merged.deletedAt || merged.completedAt) {
        if (merged.calendarEventId) {
          await deleteEvent(accessToken, merged.calendarEventId);
          await env.DB.prepare(
            "UPDATE todos SET data = json_remove(data, '$.calendarEventId') WHERE id = ? AND user_id = ?",
          ).bind(merged.id, userId).run();
        }
      } else {
        const eventId = await upsertEvent(accessToken, merged);
        if (eventId !== merged.calendarEventId && d1Data) {
          await env.DB.prepare("UPDATE todos SET data = ? WHERE id = ? AND user_id = ?")
            .bind(JSON.stringify({ ...d1Data, calendarEventId: eventId }), merged.id, userId)
            .run();
        }
      }
    } catch (e) {
      console.warn(`gcal: failed to sync todo ${todo.id}:`, e);
    }
  }

  console.log(`gcal: synced ${ids.length} todos`);
}

// ── Daily agenda block ───────────────────────────────────────────────────────

/** "YYYY-MM-DD" for the given timezone, e.g. "2026-06-25". */
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}


function formatTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}

function formatDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

function buildAgendaDescription(todos: CalTodo[], tz: string, today: string): string {
  const todayStart = new Date(`${today}T00:00:00`).getTime();

  // We compare dates in the user's timezone using date strings.
  function dateStrOf(ms: number) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  }

  const nowPlus7 = todayStart + 8 * 24 * 60 * 60 * 1000;

  const dueToday: CalTodo[] = [];
  const dueWeek: CalTodo[] = [];
  const undated: CalTodo[] = [];

  for (const t of todos) {
    if (t.completedAt || t.deletedAt) continue;
    if (!t.dueAt) {
      undated.push(t);
    } else if (dateStrOf(t.dueAt) === today) {
      dueToday.push(t);
    } else if (t.dueAt < nowPlus7) {
      dueWeek.push(t);
    }
  }

  dueToday.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  dueWeek.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));

  const lines: string[] = [];

  if (dueToday.length) {
    lines.push("DUE TODAY");
    for (const t of dueToday) {
      const hasTime = new Date(t.dueAt!).getUTCHours() !== 0 || new Date(t.dueAt!).getUTCMinutes() !== 0;
      lines.push(`• ${t.title}${hasTime ? `  ${formatTime(t.dueAt!, tz)}` : ""}`);
    }
  }

  if (dueWeek.length) {
    if (lines.length) lines.push("");
    lines.push("THIS WEEK");
    for (const t of dueWeek) {
      lines.push(`• ${t.title}  ${formatDate(t.dueAt!, tz)}`);
    }
  }

  if (undated.length) {
    if (lines.length) lines.push("");
    lines.push("ANYTIME");
    for (const t of undated) {
      lines.push(`• ${t.title}`);
    }
  }

  return lines.join("\n");
}

/**
 * Create or update today's 6:00–6:15 AM agenda event for a user.
 * Idempotent: updates the stored event if already created for today,
 * creates a fresh one if the date rolled over.
 */
export async function updateDailyAgenda(env: Env, userId: string): Promise<void> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;

  const user = await env.DB.prepare(
    `SELECT google_refresh_token, timezone,
            google_agenda_event_id, google_agenda_date
     FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{
      google_refresh_token: string | null;
      timezone: string | null;
      google_agenda_event_id: string | null;
      google_agenda_date: string | null;
    }>();
  if (!user?.google_refresh_token) return;

  const tz = user.timezone ?? "UTC";
  const today = todayInTz(tz);

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(env, user.google_refresh_token);
  } catch (e) {
    console.warn("gcal agenda: token refresh failed:", e);
    return;
  }

  // Fetch all active todos for this user.
  const rows = await env.DB.prepare(
    "SELECT data FROM todos WHERE user_id = ? AND deleted_at IS NULL",
  )
    .bind(userId)
    .all<{ data: string }>();
  const todos = (rows.results ?? []).map((r) => JSON.parse(r.data) as CalTodo);

  const dueToday = todos.filter(
    (t) => !t.completedAt && !t.deletedAt &&
      t.dueAt &&
      new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date(t.dueAt)) === today,
  );
  const title = `Nudge · ${dueToday.length} task${dueToday.length !== 1 ? "s" : ""} today`;
  const description = buildAgendaDescription(todos, tz, today);

  const eventBody = JSON.stringify({
    summary: title,
    description,
    start: { dateTime: `${today}T06:00:00`, timeZone: tz },
    end: { dateTime: `${today}T06:15:00`, timeZone: tz },
  });

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  let eventId = user.google_agenda_event_id;

  if (eventId && user.google_agenda_date === today) {
    // Update in place.
    const res = await fetch(`${CAL_BASE}/${encodeURIComponent(eventId)}`, {
      method: "PUT",
      headers,
      body: eventBody,
    });
    if (res.status === 404) eventId = null; // deleted externally — fall through to create
    else if (!res.ok) { console.warn("gcal agenda: update failed", res.status); return; }
  }

  if (!eventId || user.google_agenda_date !== today) {
    // Create a new event for today.
    const res = await fetch(CAL_BASE, { method: "POST", headers, body: eventBody });
    if (!res.ok) { console.warn("gcal agenda: create failed", res.status, await res.text()); return; }
    eventId = ((await res.json()) as { id: string }).id;
  }

  if (eventId !== user.google_agenda_event_id || today !== user.google_agenda_date) {
    await env.DB.prepare(
      "UPDATE users SET google_agenda_event_id = ?, google_agenda_date = ? WHERE id = ?",
    )
      .bind(eventId, today, userId)
      .run();
  }

  console.log(`gcal agenda: updated "${title}" for ${today} (${tz})`);
}

/**
 * Update agendas for all calendar-connected users — called from the cron job
 * so the agenda rolls over at midnight even without a push.
 */
export async function updateAllAgendas(env: Env): Promise<void> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;
  const rows = await env.DB.prepare(
    "SELECT id FROM users WHERE google_refresh_token IS NOT NULL",
  ).all<{ id: string }>();
  await Promise.all(
    (rows.results ?? []).map((r) =>
      updateDailyAgenda(env, r.id).catch((e) => console.warn("agenda error:", r.id, e)),
    ),
  );
}
