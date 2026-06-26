import {
  clearCookie,
  consumeMagicLink,
  currentUser,
  getUser,
  makeSession,
  registerPassword,
  requestMagicLink,
  sessionCookie,
  userIdForEmail,
  verifyPassword,
} from "./auth";
import { runDueReminders } from "./reminders";
import { backupToGitHub } from "./backup";
import { suggestTags } from "./ai";
import { exchangeCode, googleAuthUrl, syncCalendar, updateDailyAgenda, updateAllAgendas } from "./gcal";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  APP_URL: string;
  GITHUB_BACKUP_PAT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  AI?: Ai;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Reminder as pushed by the client, with a client-computed absolute fire time. */
interface PushReminder {
  id: string;
  type: "one_shot" | "recurring";
  channels: string[];
  cadenceDays?: number;
  stop?: "on_complete" | "at_due";
  nextFireAt?: number;
}
/** Full todo (stored verbatim) — kept loose; the client owns the shape. */
interface StoredTodo {
  id: string;
  title: string;
  notes?: string;
  dueAt?: number;
  completedAt?: number;
  deletedAt?: number;
  updatedAt: number;
}
interface PushItem {
  todo: StoredTodo;
  scheduled?: PushReminder[];
}

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    try {
      return await route(req, env, url, ctx);
    } catch (err) {
      console.error("api error", err);
      return json({ error: "internal" }, { status: 500 });
    }
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const fired = await runDueReminders(env);
    if (fired) console.log(`reminders fired: ${fired}`);
    await updateAllAgendas(env).catch((e) => console.error("agenda cron error:", e));
  },
};

async function route(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const p = url.pathname;
  const method = req.method;

  // ── Auth ────────────────────────────────────────────────────────────
  if (p === "/api/auth/request" && method === "POST") {
    const { email } = await req.json<{ email?: string }>();
    if (!email) return json({ error: "email required" }, { status: 400 });
    try {
      await requestMagicLink(env, email);
    } catch {
      // Swallow — don't reveal validity. Client always sees "check your email".
    }
    return json({ ok: true });
  }

  if (p === "/api/auth/callback" && method === "GET") {
    const token = url.searchParams.get("token") ?? "";
    const email = await consumeMagicLink(env, token);
    if (!email)
      return Response.redirect(`${env.APP_URL}/?auth=invalid`, 302);
    const session = await makeSession(env, email);
    return new Response(null, {
      status: 302,
      headers: { Location: `${env.APP_URL}/?auth=ok`, "Set-Cookie": sessionCookie(session) },
    });
  }

  if (p === "/api/auth/signup" && method === "POST") {
    const { email, password } = await req.json<{ email?: string; password?: string }>();
    if (!email || !password)
      return json({ error: "email and password required" }, { status: 400 });
    const ok = await registerPassword(env, email, password);
    if (!ok)
      return json(
        { error: "account exists or password too short (min 8)" },
        { status: 409 },
      );
    const session = await makeSession(env, email.trim().toLowerCase());
    return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(session) } });
  }

  if (p === "/api/auth/login" && method === "POST") {
    const { email, password } = await req.json<{ email?: string; password?: string }>();
    if (!email || !password)
      return json({ error: "email and password required" }, { status: 400 });
    const user = await getUser(env, email);
    if (!user?.password_hash || !(await verifyPassword(password, user.password_hash)))
      return json({ error: "invalid credentials" }, { status: 401 });
    const session = await makeSession(env, email.trim().toLowerCase());
    return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(session) } });
  }

  if (p === "/api/auth/me" && method === "GET") {
    const email = await currentUser(env, req);
    return json({ email });
  }

  if (p === "/api/auth/logout" && method === "POST") {
    return json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
  }

  // ── Todos (auth required) ───────────────────────────────────────────
  const email = await currentUser(env, req);
  if (!email) return json({ error: "unauthorized" }, { status: 401 });
  const userId = await userIdForEmail(env, email);
  if (!userId) return json({ error: "unauthorized" }, { status: 401 });

  if (p === "/api/todos/push" && method === "POST") {
    const { todos, timezone } = await req.json<{ todos: PushItem[]; timezone?: string }>();
    // Persist timezone for Calendar agenda scheduling.
    if (timezone) {
      await env.DB.prepare("UPDATE users SET timezone = ? WHERE id = ?").bind(timezone, userId).run();
    }
    await pushTodos(env, userId, todos ?? []);
    // AI tagging: synchronous so tags arrive in this response.
    const tags = await autoTagSync(env, userId, todos ?? []);
    // Calendar + agenda + backup in background (non-blocking).
    type CT = Parameters<typeof syncCalendar>[2][number];
    ctx.waitUntil(
      Promise.all([
        backupToGitHub(env).catch((e) => console.error("backup error:", e)),
        syncCalendar(env, userId, (todos ?? []).map((i) => i.todo as unknown as CT)).catch((e) => console.error("gcal error:", e)),
        updateDailyAgenda(env, userId).catch((e) => console.error("agenda error:", e)),
      ]),
    );
    return json({ ok: true, count: todos?.length ?? 0, tags });
  }

  // ── Google Calendar OAuth ───────────────────────────────────────────
  if (p === "/api/auth/google" && method === "GET") {
    const { nanoid } = await import("nanoid");
    const state = nanoid(16);
    // Stash state in a short-lived cookie to verify on callback.
    const url = googleAuthUrl(env, state);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Set-Cookie": `gcal_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`,
      },
    });
  }

  if (p === "/api/auth/google/callback" && method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieState = req.headers.get("Cookie")?.match(/gcal_state=([^;]+)/)?.[1];
    if (!code || !state || state !== cookieState) {
      return Response.redirect(`${env.APP_URL}/?gcal=error`, 302);
    }
    try {
      const tokens = await exchangeCode(env, code);
      if (tokens.refresh_token) {
        await env.DB.prepare("UPDATE users SET google_refresh_token = ? WHERE id = ?")
          .bind(tokens.refresh_token, userId)
          .run();
      }
    } catch (e) {
      console.error("gcal oauth error:", e);
      return Response.redirect(`${env.APP_URL}/?gcal=error`, 302);
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${env.APP_URL}/?gcal=connected`,
        "Set-Cookie": "gcal_state=; Path=/; HttpOnly; Max-Age=0",
      },
    });
  }

  if (p === "/api/auth/google/disconnect" && method === "POST") {
    await env.DB.prepare("UPDATE users SET google_refresh_token = NULL WHERE id = ?")
      .bind(userId)
      .run();
    return json({ ok: true });
  }

  if (p === "/api/auth/google/status" && method === "GET") {
    const row = await env.DB.prepare(
      "SELECT google_refresh_token FROM users WHERE id = ?",
    )
      .bind(userId)
      .first<{ google_refresh_token: string | null }>();
    return json({ connected: !!row?.google_refresh_token });
  }

  // ── Push notifications ──────────────────────────────────────────────
  if (p === "/api/push/key" && method === "GET") {
    // Strip surrounding quotes that wrangler secret put sometimes stores verbatim
    const key = (env.VAPID_PUBLIC_KEY ?? "").replace(/^["']|["']$/g, "").trim();
    return json({ key });
  }

  if (p === "/api/push/subscribe" && method === "POST") {
    const { endpoint, p256dh, auth } = await req.json<{
      endpoint: string;
      p256dh: string;
      auth: string;
    }>();
    if (!endpoint || !p256dh || !auth)
      return json({ error: "missing fields" }, { status: 400 });
    const { nanoid } = await import("nanoid");
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(nanoid(), userId, endpoint, p256dh, auth, Date.now())
      .run();
    return json({ ok: true });
  }

  if (p === "/api/push/unsubscribe" && method === "POST") {
    const { endpoint } = await req.json<{ endpoint: string }>();
    if (endpoint) {
      await env.DB.prepare(
        "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
      )
        .bind(userId, endpoint)
        .run();
    }
    return json({ ok: true });
  }

  if (p === "/api/todos" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT data FROM todos WHERE user_id = ? AND deleted_at IS NULL",
    )
      .bind(userId)
      .all<{ data: string }>();
    const todos = (rows.results ?? []).map((r) => JSON.parse(r.data));
    return json({ todos });
  }

  return json({ error: "not found" }, { status: 404 });
}

/**
 * Tag untagged todos synchronously during the push so tags arrive in the response.
 * Runs all AI calls concurrently, abandons after 5 s, and persists to D1.
 * Returns a map of { todoId → tags[] } for the client to apply immediately.
 */
async function autoTagSync(
  env: Env,
  userId: string,
  items: PushItem[],
): Promise<Record<string, string[]>> {
  if (!env.AI) return {};

  type Tagged = PushItem & { todo: StoredTodo & { tags?: string[] } };
  const untagged = (items as Tagged[]).filter(
    ({ todo: t }) => t?.id && !t.deletedAt && !t.completedAt && !(t.tags && t.tags.length > 0),
  );
  if (untagged.length === 0) return {};

  console.log(`autoTagSync: ${untagged.length} untagged`);
  const result: Record<string, string[]> = {};

  const tagWork = Promise.all(
    untagged.map(async ({ todo: t }) => {
      const tags = await suggestTags(env.AI!, t.title, t.notes);
      console.log(`autoTagSync: "${t.title}" → [${tags.join(", ")}]`);
      if (tags.length === 0) return;
      result[t.id] = tags;
      await env.DB.prepare("UPDATE todos SET data = ? WHERE id = ? AND user_id = ?")
        .bind(JSON.stringify({ ...(t as object), tags }), t.id, userId)
        .run();
    }),
  );

  const timeoutP = new Promise<void>((resolve) =>
    setTimeout(() => { console.log("autoTagSync: 8 s timeout"); resolve(); }, 8000),
  );

  await Promise.race([tagWork, timeoutP]);
  console.log(`autoTagSync: done, tagged ${Object.keys(result).length}`);
  return result;
}

/** One-way upsert: store each (full) todo and rebuild its reminder schedule. */
async function pushTodos(
  env: Env,
  userId: string,
  items: PushItem[],
): Promise<void> {
  for (const { todo: t, scheduled } of items) {
    if (!t?.id) continue;
    await env.DB.prepare(
      `INSERT INTO todos (id, user_id, data, due_at, completed_at, deleted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data, due_at = excluded.due_at,
         completed_at = excluded.completed_at, deleted_at = excluded.deleted_at,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at >= todos.updated_at`,
    )
      .bind(
        t.id,
        userId,
        JSON.stringify(t),
        t.dueAt ?? null,
        t.completedAt ?? null,
        t.deletedAt ?? null,
        t.updatedAt,
      )
      .run();

    // Rebuild reminders for this todo (idempotent).
    await env.DB.prepare("DELETE FROM reminders WHERE todo_id = ?").bind(t.id).run();

    const active = !t.completedAt && !t.deletedAt;
    if (!active) continue;

    for (const r of scheduled ?? []) {
      if (r.nextFireAt == null) continue;
      await env.DB.prepare(
        `INSERT INTO reminders
           (id, todo_id, user_id, type, channels, title, notes, due_at,
            cadence_days, stop, next_fire_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      )
        .bind(
          r.id,
          t.id,
          userId,
          r.type,
          JSON.stringify(r.channels ?? ["email"]),
          t.title,
          t.notes ?? null,
          t.dueAt ?? null,
          r.cadenceDays ?? null,
          r.stop ?? null,
          r.nextFireAt,
        )
        .run();
    }
  }
}
