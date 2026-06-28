import { format } from "date-fns";
import { nanoid } from "nanoid";
import { db } from "./db";
import { matchEmoji } from "./emoji";
import type { Habit, HabitLog, HabitLogState } from "./types";

const now = () => Date.now();

/** Local calendar day key, "YYYY-MM-DD" — the unit of habit logging. */
export function dayKey(d: Date | number = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human label for a habit's schedule, e.g. "Mon Wed Fri" or "5×/week". */
export function describeSchedule(h: Habit): string {
  if (h.scheduleModel === "flexible") {
    const t = Math.max(1, h.targetCount ?? 1);
    return `${t}×/${h.period === "month" ? "month" : "week"}`;
  }
  const wd = h.weekdays && h.weekdays.length ? [...h.weekdays].sort() : [0, 1, 2, 3, 4, 5, 6];
  if (wd.length === 7) return "Every day";
  return wd.map((d) => WEEKDAY_NAMES[d]).join(" ");
}

/** Backfill missing fields so a partial/older record can't crash rendering. */
export function normalizeHabit(h: Habit): Habit {
  return {
    ...h,
    scheduleModel: h.scheduleModel ?? "fixed_weekdays",
    weekdays: Array.isArray(h.weekdays) ? h.weekdays : undefined,
    measurement: h.measurement ?? "binary",
    channels: Array.isArray(h.channels) ? h.channels : [],
    tags: Array.isArray(h.tags) ? h.tags : undefined,
    sortOrder: h.sortOrder ?? 0,
    createdAt: h.createdAt ?? h.updatedAt ?? now(),
    updatedAt: h.updatedAt ?? now(),
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createHabit(
  input: Partial<Habit> & { title: string },
): Promise<string> {
  const ts = now();
  const first = await db.habits.orderBy("sortOrder").first();
  const minOrder = first?.sortOrder ?? 0;
  const habit: Habit = {
    id: nanoid(),
    title: input.title.trim(),
    notes: input.notes,
    // Curated emoji for known habits (distinct + reliable); unknowns stay blank
    // so the server's AI can suggest one.
    icon: input.icon ?? (matchEmoji(input.title.trim()) || undefined),
    scheduleModel: input.scheduleModel ?? "fixed_weekdays",
    weekdays: input.weekdays ?? (input.scheduleModel === "flexible" ? undefined : [0, 1, 2, 3, 4, 5, 6]),
    period: input.period,
    targetCount: input.targetCount,
    measurement: input.measurement ?? "binary",
    unit: input.unit,
    targetAmount: input.targetAmount,
    countDoneOnlyIfTarget: input.countDoneOnlyIfTarget,
    timeOfDay: input.timeOfDay,
    channels: input.channels ?? [],
    escalate: input.escalate,
    streakAtRisk: input.streakAtRisk,
    tags: input.tags,
    sortOrder: input.sortOrder ?? minOrder - 1,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.habits.add(habit);
  return habit.id;
}

export async function updateHabit(id: string, patch: Partial<Habit>): Promise<void> {
  await db.habits.update(id, { ...patch, updatedAt: now() });
}

export async function archiveHabit(id: string, archived = true): Promise<void> {
  await updateHabit(id, { archivedAt: archived ? now() : undefined });
}

/** Soft-delete (tombstone) so the deletion can sync. Logs are left in place. */
export async function deleteHabit(id: string): Promise<void> {
  await updateHabit(id, { deletedAt: now() });
}

// ── Logging ──────────────────────────────────────────────────────────────────

/** The existing log for a habit on a given day, if any (ignores tombstones). */
export async function getLog(habitId: string, date: string): Promise<HabitLog | undefined> {
  const log = await db.habitLogs.where("[habitId+date]").equals([habitId, date]).first();
  return log && !log.deletedAt ? log : undefined;
}

/**
 * Record (or amend) a habit's occurrence for a day. Upserts the single
 * per-day log. Pass `state: "skip"` for an intentional rest day. `amount` is
 * for measured habits. Used for both today and backfill of past days.
 */
export async function logHabit(
  habitId: string,
  opts: { date?: string; state?: HabitLogState; amount?: number; note?: string } = {},
): Promise<void> {
  const date = opts.date ?? dayKey();
  const existing = await db.habitLogs
    .where("[habitId+date]")
    .equals([habitId, date])
    .first();
  const ts = now();
  if (existing) {
    await db.habitLogs.update(existing.id, {
      state: opts.state ?? existing.state,
      amount: opts.amount ?? existing.amount,
      note: opts.note ?? existing.note,
      deletedAt: undefined,
      updatedAt: ts,
    });
    return;
  }
  await db.habitLogs.add({
    id: nanoid(),
    habitId,
    date,
    state: opts.state ?? "done",
    amount: opts.amount,
    note: opts.note,
    createdAt: ts,
    updatedAt: ts,
  });
}

/** Remove a day's log (soft-delete tombstone). Used to undo a mark. */
export async function clearLog(habitId: string, date = dayKey()): Promise<void> {
  const existing = await db.habitLogs
    .where("[habitId+date]")
    .equals([habitId, date])
    .first();
  if (existing) await db.habitLogs.update(existing.id, { deletedAt: now(), updatedAt: now() });
}

/**
 * Toggle "done" for a habit on a given day (defaults to today). For binary
 * habits this is a one-tap mark/unmark; for measured habits pass an amount.
 * Used for today's logging and heatmap backfill of past days.
 */
export async function toggleDone(
  habitId: string,
  date = dayKey(),
  amount?: number,
): Promise<void> {
  const existing = await getLog(habitId, date);
  if (existing && existing.state === "done") {
    await clearLog(habitId, date);
  } else {
    await logHabit(habitId, { date, state: "done", amount });
  }
}

/** Convenience: toggle today's done state. */
export const toggleToday = (habitId: string, amount?: number) =>
  toggleDone(habitId, dayKey(), amount);

// ── Sync merge (newer-wins, additive — mirrors mergeServerTodos) ──────────────

export async function mergeServerHabits(serverHabits: Habit[]): Promise<void> {
  await db.transaction("rw", db.habits, async () => {
    for (const raw of serverHabits) {
      if (!raw?.id) continue;
      const s = normalizeHabit(raw);
      const local = await db.habits.get(s.id);
      if (!local || (s.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
        await db.habits.put(s);
      }
    }
  });
}

export async function mergeServerHabitLogs(serverLogs: HabitLog[]): Promise<void> {
  await db.transaction("rw", db.habitLogs, async () => {
    for (const raw of serverLogs) {
      if (!raw?.id) continue;
      const local = await db.habitLogs.get(raw.id);
      if (!local || (raw.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
        await db.habitLogs.put(raw);
      }
    }
  });
}
