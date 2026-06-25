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

  signup: (email: string, password: string) =>
    req<{ ok: true }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    req<{ ok: true }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  /** Pull all of the signed-in user's todos from the server. */
  getTodos: () => req<{ todos: Todo[] }>("/api/todos").then((r) => r.todos),

  /**
   * One-way upsert to the server. Sends the *full* todo (so a later pull is
   * loss-less) plus client-computed absolute reminder fire times.
   */
  push: (todos: Todo[]) =>
    req<{ ok: true; count: number; tags?: Record<string, string[]> }>("/api/todos/push", {
      method: "POST",
      body: JSON.stringify({
        todos: todos.map((t) => ({ todo: t, scheduled: scheduleReminders(t) })),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }),
};
