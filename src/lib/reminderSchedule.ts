import { addDays } from "date-fns";
import type { Reminder, Todo } from "./types";

/** Reminder flattened for the server, with an absolute fire time (local tz). */
export interface ScheduledReminder {
  id: string;
  type: Reminder["type"];
  channels: Reminder["channels"];
  cadenceDays?: number;
  stop?: Reminder["stop"];
  /** Epoch ms of the next time this should fire, or undefined if N/A. */
  nextFireAt?: number;
}

const MIN_MS = 60_000;
const GRACE_MS = 60_000;

/**
 * Compute the next fire time for each of a todo's reminders, using the device's
 * local timezone. Recurring "nags" only need their *next* ping — the server
 * rolls subsequent ones forward by cadence.
 */
export function scheduleReminders(todo: Todo, now = Date.now()): ScheduledReminder[] {
  if (todo.completedAt || todo.deletedAt || todo.dueAt === undefined) return [];
  const due = todo.dueAt;

  return todo.reminders.map((r) => {
    const base = {
      id: r.id,
      type: r.type,
      channels: r.channels,
      cadenceDays: r.cadenceDays,
      stop: r.stop,
    };
    if (r.type === "one_shot") {
      const fire = due - (r.offsetMinutes ?? 0) * MIN_MS;
      return { ...base, nextFireAt: fire >= now - GRACE_MS ? fire : undefined };
    }
    return { ...base, nextFireAt: nextNagFire(r, due, now) };
  });
}

function nextNagFire(r: Reminder, due: number, now: number): number | undefined {
  const windowStart = due - (r.windowStartMinutes ?? 7 * 1440) * MIN_MS;
  const [hh, mm] = (r.timeOfDay ?? "09:00").split(":").map(Number);

  // First candidate day = the later of (window open, now).
  const earliest = Math.max(windowStart, now);
  let day = new Date(earliest);
  let fire = atTime(day, hh, mm);
  if (fire.getTime() < earliest) {
    day = addDays(day, 1);
    fire = atTime(day, hh, mm);
  }

  const fireMs = fire.getTime();
  if (r.stop === "at_due" && fireMs >= due) return undefined;
  return fireMs;
}

function atTime(day: Date, hh: number, mm: number): Date {
  const d = new Date(day);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}
