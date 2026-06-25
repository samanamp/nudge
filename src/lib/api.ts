import type { Todo } from "./types";
import { scheduleReminders } from "./reminderSchedule";

/**
 * API base. Empty string => same origin (the Worker serves the app + /api).
 * Override with VITE_API_BASE for split local dev (Vite on 5173, Worker on 8787).
 */
const BASE = import.meta.env.VITE_API_BASE ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  requestLink: (email: string) =>
    req<{ ok: true }>("/api/auth/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  me: () => req<{ email: string | null }>("/api/auth/me"),

  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  /** Pull all of the signed-in user's todos from the server. */
  getTodos: () => req<{ todos: Todo[] }>("/api/todos").then((r) => r.todos),

  /** One-way upsert of todos (+ computed reminder fire times) to the server. */
  push: (todos: Todo[]) =>
    req<{ ok: true; count: number }>("/api/todos/push", {
      method: "POST",
      body: JSON.stringify({
        todos: todos.map((t) => ({
          id: t.id,
          title: t.title,
          notes: t.notes,
          dueAt: t.dueAt,
          completedAt: t.completedAt,
          deletedAt: t.deletedAt,
          updatedAt: t.updatedAt,
          reminders: scheduleReminders(t),
        })),
      }),
    }),
};
