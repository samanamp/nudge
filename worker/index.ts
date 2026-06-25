import {
  clearCookie,
  consumeMagicLink,
  currentUser,
  makeSession,
  requestMagicLink,
  sessionCookie,
  userIdForEmail,
} from "./auth";
import { runDueReminders } from "./reminders";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  APP_URL: string;
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
interface PushTodo {
  id: string;
  title: string;
  notes?: string;
  dueAt?: number;
  completedAt?: number;
  deletedAt?: number;
  updatedAt: number;
  reminders?: PushReminder[];
}

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    try {
      return await route(req, env, url);
    } catch (err) {
      console.error("api error", err);
      return json({ error: "internal" }, { status: 500 });
    }
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const fired = await runDueReminders(env);
    if (fired) console.log(`reminders fired: ${fired}`);
  },
};

async function route(req: Request, env: Env, url: URL): Promise<Response> {
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
    const { todos } = await req.json<{ todos: PushTodo[] }>();
    await pushTodos(env, userId, todos ?? []);
    return json({ ok: true, count: todos?.length ?? 0 });
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

/** One-way upsert: store each todo and rebuild its reminder schedule. */
async function pushTodos(
  env: Env,
  userId: string,
  todos: PushTodo[],
): Promise<void> {
  for (const t of todos) {
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

    for (const r of t.reminders ?? []) {
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
