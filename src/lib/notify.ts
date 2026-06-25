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
  const cutoff = Date.now() - 2 * 86_400_000;
  for (const k of Object.keys(map)) if (map[k] < cutoff) delete map[k];
  localStorage.setItem(SHOWN_KEY, JSON.stringify(map));
}

function urlB64ToUint8Array(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Request notification permission + subscribe to Web Push. Returns the new permission state. */
export async function requestAndSubscribePush(): Promise<NotificationPermission> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "denied";
  if (Notification.permission === "denied") return "denied";

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm;

  try {
    const reg = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    const { key } = (await fetch("/api/push/key").then((r) => r.json())) as { key: string };
    if (!key) return perm;

    // Subscribe (or reuse existing subscription)
    const keyBytes = urlB64ToUint8Array(key);
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array(keyBytes.buffer.slice(0) as ArrayBuffer),
      }));

    const json = sub.toJSON();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      }),
    });
  } catch (e) {
    console.warn("push subscribe failed:", e);
  }

  return perm;
}

/** Unsubscribe from Web Push (called on sign-out or user preference). */
export async function unsubscribePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  } catch (e) {
    console.warn("push unsubscribe failed:", e);
  }
}

/**
 * While the app is open, fire local browser notifications for reminders whose
 * time has arrived (the "reminders while open" path; web push handles the rest).
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
