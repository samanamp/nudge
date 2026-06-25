import { useCallback, useEffect, useRef, useState } from "react";
import type { Todo } from "./types";
import { api } from "./api";
import { clearAllTodos, mergeServerTodos } from "./db";

export type AuthStatus = "loading" | "in" | "out";

const EMAIL_KEY = "nudge_email";

export interface Session {
  status: AuthStatus;
  email: string | null;
  refresh: () => void;
  logout: () => Promise<void>;
}

/**
 * Tracks the signed-in user. Optimistic + offline-safe: we remember the last
 * known email locally so a temporary network failure doesn't bounce a
 * signed-in user back to the login screen (offline-first stays intact). Only a
 * definitive `me() === null` (server reachable, no session) signs out.
 */
export function useSession(): Session {
  const remembered = () => localStorage.getItem(EMAIL_KEY);
  const [email, setEmail] = useState<string | null>(remembered);
  const [status, setStatus] = useState<AuthStatus>(
    remembered() ? "in" : "loading",
  );

  const refresh = useCallback(() => {
    api
      .me()
      .then(({ email }) => {
        if (email) {
          localStorage.setItem(EMAIL_KEY, email);
          setEmail(email);
          setStatus("in");
        } else {
          localStorage.removeItem(EMAIL_KEY);
          setEmail(null);
          setStatus("out");
        }
      })
      .catch(() => {
        // Server unreachable (offline): trust the remembered session.
        setStatus(remembered() ? "in" : "out");
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    localStorage.removeItem(EMAIL_KEY);
    await clearAllTodos(); // data lives on the server; pulled back on next login
    setEmail(null);
    setStatus("out");
  }, []);

  return { status, email, refresh, logout };
}

/** On sign-in (and when online), pull the user's todos into the local store. */
export function usePullOnLogin(status: AuthStatus, email: string | null): void {
  const pulledFor = useRef<string | null>(null);

  useEffect(() => {
    // Reset on logout so the next sign-in always pulls fresh data.
    if (status === "out") {
      pulledFor.current = null;
      return;
    }
    if (status !== "in" || !email || !navigator.onLine) return;
    if (pulledFor.current === email) return;
    pulledFor.current = email;
    api
      .getTodos()
      .then(mergeServerTodos)
      .catch(() => {
        pulledFor.current = null; // allow a retry later
      });
  }, [status, email]);
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
