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

/** Request notification permission + subscribe to Web Push.
 *  Throws a descriptive Error on failure so the caller can surface it. */
export async function requestAndSubscribePush(): Promise<NotificationPermission> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Push notifications are not supported in this browser");
  }
  if (Notification.permission === "denied") {
    throw new Error("Notifications are blocked — enable them in browser settings");
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm;

  // Fetch VAPID public key first (no SW dependency)
  const keyRes = await fetch("/api/push/key").then((r) => r.json()) as { key?: string };
  if (!keyRes.key) throw new Error("Could not fetch push key from server");

  // Wait for an active service worker, with timeout
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Service worker not ready — try reloading the page")), 8000),
    ),
  ]);

  const keyBytes = urlB64ToUint8Array(keyRes.key);
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer.slice(0) as ArrayBuffer,
    }));

  const subJson = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    }),
  });
  if (!res.ok) throw new Error(`Server failed to save subscription (${res.status})`);

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
