import { useEffect } from "react";
import type { Todo } from "./types";
import { scheduleReminders } from "./reminderSchedule";

const SHOWN_KEY = "nudge_shown_reminders";
const CHECK_MS = 30_000;

function loadShown(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function saveShown(map: Record<string, number>) {
  // Keep it from growing forever: drop entries older than 2 days.
  const cutoff = Date.now() - 2 * 86_400_000;
  for (const k of Object.keys(map)) if (map[k] < cutoff) delete map[k];
  localStorage.setItem(SHOWN_KEY, JSON.stringify(map));
}

/** Ask for notification permission (call from a user gesture). */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/**
 * While the app is open, fire local browser notifications for reminders whose
 * time has arrived. This is the v1 "reminders while open" path; server email +
 * web push (app closed) come in later milestones.
 */
export function useInAppReminders(todos: Todo[]): void {
  useEffect(() => {
    if (!("Notification" in window)) return;

    const tick = () => {
      if (Notification.permission !== "granted") return;
      const now = Date.now();
      const shown = loadShown();
      let changed = false;

      for (const todo of todos) {
        for (const r of scheduleReminders(todo, now)) {
          if (r.nextFireAt == null) continue;
          // Fire if due within the last check window and not already shown.
          if (r.nextFireAt <= now && r.nextFireAt > now - CHECK_MS * 2 && !shown[r.id]) {
            new Notification(todo.title, {
              body: todo.notes || "Reminder",
              tag: r.id,
            });
            shown[r.id] = now;
            changed = true;
          }
        }
      }
      if (changed) saveShown(shown);
    };

    tick();
    const interval = window.setInterval(tick, CHECK_MS);
    return () => window.clearInterval(interval);
  }, [todos]);
}
