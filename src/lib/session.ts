import { useCallback, useEffect, useRef, useState } from "react";
import type { Todo } from "./types";
import { api } from "./api";

export type AuthStatus = "loading" | "in" | "out";

export interface Session {
  status: AuthStatus;
  email: string | null;
  refresh: () => void;
  logout: () => Promise<void>;
}

/** Tracks the signed-in user via the session cookie. */
export function useSession(): Session {
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refresh = useCallback(() => {
    api
      .me()
      .then(({ email }) => {
        setEmail(email);
        setStatus(email ? "in" : "out");
      })
      .catch(() => setStatus("out"));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setEmail(null);
    setStatus("out");
  }, []);

  return { status, email, refresh, logout };
}

/**
 * When signed in and online, push todos to the server (debounced) so reminders
 * can be delivered. One-way for v1; full sync is a later milestone.
 */
export function usePushSync(todos: Todo[], enabled: boolean): void {
  const timer = useRef<number | undefined>(undefined);
  const lastSig = useRef("");

  useEffect(() => {
    if (!enabled || !navigator.onLine) return;
    // Signature of reminder-relevant fields; skip pushes that change nothing.
    const sig = JSON.stringify(
      todos.map((t) => [
        t.id,
        t.updatedAt,
        t.dueAt,
        t.completedAt,
        t.deletedAt,
        t.reminders.length,
      ]),
    );
    if (sig === lastSig.current) return;

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api
        .push(todos)
        .then(() => {
          lastSig.current = sig;
        })
        .catch(() => {});
    }, 1500);

    return () => window.clearTimeout(timer.current);
  }, [todos, enabled]);
}
