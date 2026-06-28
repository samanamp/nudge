import { useCallback, useEffect, useRef, useState } from "react";
import type { Todo, Habit, HabitLog } from "./types";
import { api } from "./api";
import { db, clearAllTodos, mergeServerTodos } from "./db";
import { mergeServerHabits, mergeServerHabitLogs } from "./habits";

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

export interface SyncHandle {
  syncing: boolean;
  syncNow: () => void;
  lastSyncedAt: number | null;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/**
 * On sign-in, pull todos from server. Also pulls whenever the tab regains
 * visibility (cheap: fires only when the user actually switches back).
 * Returns a handle for a manual sync trigger + loading state.
 */
export function usePullOnLogin(
  status: AuthStatus,
  email: string | null,
): SyncHandle {
  const pulledFor = useRef<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const pull = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const [todos, habits] = await Promise.all([api.getTodos(), api.getHabits()]);
      await mergeServerTodos(todos);
      await mergeServerHabits(habits.habits);
      await mergeServerHabitLogs(habits.logs);
    } catch {
      // network failure — leave local state intact
    } finally {
      setSyncing(false);
    }
  }, []);

  // Initial pull on login; reset guard on logout.
  useEffect(() => {
    if (status === "out") {
      pulledFor.current = null;
      return;
    }
    if (status !== "in" || !email) return;
    if (pulledFor.current === email) return;
    pulledFor.current = email;
    pull();
  }, [status, email, pull]);

  // Pull when the tab comes back into focus — no polling needed.
  useEffect(() => {
    if (status !== "in" || !email) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status, email, pull]);

  return { syncing, syncNow: pull, lastSyncedAt: null };
}

/**
 * When signed in and online, push todos to the server (debounced) so reminders
 * can be delivered. One-way for v1; full sync is a later milestone.
 */
export function usePushSync(todos: Todo[], enabled: boolean): { lastSyncedAt: number | null } {
  const timer = useRef<number | undefined>(undefined);
  const lastSig = useRef("");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

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
        .then(async (result) => {
          lastSig.current = sig;
          setLastSyncedAt(Date.now());
          const tagMap = result.tags ?? {};
          for (const [id, tags] of Object.entries(tagMap)) {
            await db.todos.update(id, { tags });
          }
        })
        .catch(() => {});
    }, 1500);

    return () => window.clearTimeout(timer.current);
  }, [todos, enabled]);

  return { lastSyncedAt };
}

/**
 * Debounced one-way push of habits + their logs (mirrors usePushSync). Sends
 * the full local arrays so a later pull is loss-less; server upserts newer-wins.
 */
export function usePushHabits(
  habits: Habit[],
  logs: HabitLog[],
  enabled: boolean,
): void {
  const timer = useRef<number | undefined>(undefined);
  const lastSig = useRef("");

  useEffect(() => {
    if (!enabled || !navigator.onLine) return;
    const sig = JSON.stringify([
      habits.map((h) => [h.id, h.updatedAt]),
      logs.map((l) => [l.id, l.updatedAt]),
    ]);
    if (sig === lastSig.current) return;

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api
        .pushHabits(habits, logs)
        .then(async (result) => {
          lastSig.current = sig;
          // Apply AI-suggested emojis without bumping updatedAt (no re-push loop).
          for (const [id, icon] of Object.entries(result.icons ?? {})) {
            await db.habits.update(id, { icon });
          }
        })
        .catch(() => {});
    }, 1500);

    return () => window.clearTimeout(timer.current);
  }, [habits, logs, enabled]);
}
