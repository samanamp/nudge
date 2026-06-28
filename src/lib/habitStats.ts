import {
  addDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  addWeeks,
  addMonths,
  format,
} from "date-fns";
import type { Habit, HabitLog } from "./types";

/**
 * Habit statistics — streaks, completion rates, period progress, and per-day
 * status for the heatmap. All pure: they take a habit + its logs + a reference
 * "today", so they're trivially testable and have no DB dependency.
 *
 * Conventions:
 *  - "skip" is an intentional rest day: transparent to streaks, excluded from
 *    completion-rate denominators (it never counts against you).
 *  - "miss" is *derived* — an expected day/period that passed with no done log.
 *  - Today with no log is in "grace": it neither breaks a streak nor counts as
 *    a miss (the day isn't over yet).
 */

const MAX_ITERS = 2000;
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export type DayStatus = "done" | "skip" | "miss" | "off" | "none" | "future";

/** Local day key, "YYYY-MM-DD". */
const keyOf = (d: Date): string => format(d, "yyyy-MM-dd");

/** Parse a "YYYY-MM-DD" key as a local-midnight Date (timezone-safe). */
function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Index a habit's logs by day key for O(1) lookup (latest log per day wins). */
export function indexLogs(logs: HabitLog[]): Map<string, HabitLog> {
  const map = new Map<string, HabitLog>();
  for (const log of logs) {
    if (log.deletedAt) continue;
    const prev = map.get(log.date);
    if (!prev || (log.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) map.set(log.date, log);
  }
  return map;
}

/** Whether the habit is expected on this weekday (fixed model). */
function expectedWeekday(habit: Habit, date: Date): boolean {
  const wd = habit.weekdays && habit.weekdays.length ? habit.weekdays : ALL_WEEKDAYS;
  return wd.includes(date.getDay());
}

/**
 * Whether a log counts as a completed session. Honors `countDoneOnlyIfTarget`
 * for measured habits (a below-target session doesn't count toward streaks).
 */
export function countsAsDone(habit: Habit, log: HabitLog | undefined): boolean {
  if (!log || log.deletedAt || log.state !== "done") return false;
  if (
    habit.measurement === "measured" &&
    habit.countDoneOnlyIfTarget &&
    habit.targetAmount != null
  ) {
    return (log.amount ?? 0) >= habit.targetAmount;
  }
  return true;
}

// ── Period helpers (flexible model + week-based fixed review) ─────────────────

function periodStart(habit: Habit, date: Date): Date {
  return habit.period === "month"
    ? startOfMonth(date)
    : startOfWeek(date, { weekStartsOn: 0 });
}
function prevPeriodStart(habit: Habit, start: Date): Date {
  return habit.period === "month" ? startOfMonth(subMonths(start, 1)) : subWeeks(start, 1);
}
function nextPeriodStart(habit: Habit, start: Date): Date {
  return habit.period === "month" ? startOfMonth(addMonths(start, 1)) : addWeeks(start, 1);
}
function periodEnd(habit: Habit, start: Date): Date {
  return habit.period === "month" ? endOfMonth(start) : addDays(start, 6);
}
function periodId(habit: Habit, date: Date): string {
  return keyOf(periodStart(habit, date));
}

/** Count completed sessions within the period containing `start`. */
function doneInPeriod(habit: Habit, logs: Map<string, HabitLog>, start: Date): number {
  const s = periodStart(habit, start);
  const e = periodEnd(habit, s);
  let n = 0;
  for (const log of logs.values()) {
    const d = parseDay(log.date);
    if (d >= s && d <= e && countsAsDone(habit, log)) n++;
  }
  return n;
}

// ── Per-day status (heatmap) ─────────────────────────────────────────────────

export function dayStatus(
  habit: Habit,
  dateKey: string,
  logs: Map<string, HabitLog>,
  today: Date = new Date(),
): DayStatus {
  const todayKey = keyOf(today);
  if (dateKey > todayKey) return "future";

  const log = logs.get(dateKey);
  if (log && !log.deletedAt) {
    if (log.state === "skip") return "skip";
    if (countsAsDone(habit, log)) return "done";
  }

  if (habit.scheduleModel === "flexible") {
    // No per-day expectation; the period is the unit of success.
    return "none";
  }

  // Fixed weekdays.
  if (!expectedWeekday(habit, parseDay(dateKey))) return "off";
  return dateKey === todayKey ? "none" : "miss";
}

// ── Streaks ──────────────────────────────────────────────────────────────────

export function currentStreak(
  habit: Habit,
  logs: Map<string, HabitLog>,
  today: Date = new Date(),
): number {
  return habit.scheduleModel === "flexible"
    ? currentStreakFlexible(habit, logs, today)
    : currentStreakFixed(habit, logs, today);
}

function currentStreakFixed(habit: Habit, logs: Map<string, HabitLog>, today: Date): number {
  const todayKey = keyOf(today);
  let count = 0;
  let cursor = today;
  for (let i = 0; i < MAX_ITERS; i++) {
    if (expectedWeekday(habit, cursor)) {
      const key = keyOf(cursor);
      const log = logs.get(key);
      if (log?.state === "skip") {
        // transparent — neither counts nor breaks
      } else if (countsAsDone(habit, log)) {
        count++;
      } else if (key !== todayKey) {
        break; // a past expected day with no done log: streak ends
      }
      // else: today, no log yet — grace, keep scanning
    }
    cursor = addDays(cursor, -1);
  }
  return count;
}

function currentStreakFlexible(habit: Habit, logs: Map<string, HabitLog>, today: Date): number {
  const target = Math.max(1, habit.targetCount ?? 1);
  const curId = periodId(habit, today);
  let count = 0;
  let cursor = periodStart(habit, today);
  for (let i = 0; i < MAX_ITERS; i++) {
    if (doneInPeriod(habit, logs, cursor) >= target) {
      count++;
    } else if (periodId(habit, cursor) !== curId) {
      break; // a past period that missed its target: streak ends
    }
    // else: current period not yet met — grace
    cursor = prevPeriodStart(habit, cursor);
  }
  return count;
}

export function longestStreak(
  habit: Habit,
  logs: Map<string, HabitLog>,
  today: Date = new Date(),
): number {
  if (logs.size === 0) return 0;
  const earliest = [...logs.keys()].sort()[0];
  return habit.scheduleModel === "flexible"
    ? longestFlexible(habit, logs, parseDay(earliest), today)
    : longestFixed(habit, logs, parseDay(earliest), today);
}

function longestFixed(habit: Habit, logs: Map<string, HabitLog>, from: Date, today: Date): number {
  const todayKey = keyOf(today);
  let run = 0;
  let max = 0;
  let cursor = from;
  for (let i = 0; i < MAX_ITERS && cursor <= today; i++) {
    if (expectedWeekday(habit, cursor)) {
      const key = keyOf(cursor);
      const log = logs.get(key);
      if (log?.state === "skip") {
        // neutral
      } else if (countsAsDone(habit, log)) {
        run++;
        max = Math.max(max, run);
      } else if (key !== todayKey) {
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return max;
}

function longestFlexible(habit: Habit, logs: Map<string, HabitLog>, from: Date, today: Date): number {
  const target = Math.max(1, habit.targetCount ?? 1);
  const curId = periodId(habit, today);
  let run = 0;
  let max = 0;
  let cursor = periodStart(habit, from);
  for (let i = 0; i < MAX_ITERS && cursor <= today; i++) {
    if (doneInPeriod(habit, logs, cursor) >= target) {
      run++;
      max = Math.max(max, run);
    } else if (periodId(habit, cursor) !== curId) {
      run = 0;
    }
    cursor = nextPeriodStart(habit, cursor);
  }
  return max;
}

// ── Completion rate over a rolling window ────────────────────────────────────

/** Fraction in [0,1] of expected occurrences completed in the last N days, or null if none were due. */
export function completionRate(
  habit: Habit,
  logs: Map<string, HabitLog>,
  windowDays: number,
  today: Date = new Date(),
): number | null {
  const todayKey = keyOf(today);
  if (habit.scheduleModel === "flexible") {
    const target = Math.max(1, habit.targetCount ?? 1);
    let periods = 0;
    let cursor = periodStart(habit, addDays(today, -(windowDays - 1)));
    const end = periodStart(habit, today);
    for (let i = 0; i < MAX_ITERS && cursor <= end; i++) {
      periods++;
      cursor = nextPeriodStart(habit, cursor);
    }
    if (periods === 0) return null;
    let done = 0;
    const start = addDays(today, -(windowDays - 1));
    for (const log of logs.values()) {
      const d = parseDay(log.date);
      if (d >= start && d <= today && countsAsDone(habit, log)) done++;
    }
    return Math.min(1, done / (target * periods));
  }

  // Fixed weekdays.
  let due = 0;
  let done = 0;
  for (let i = 0; i < windowDays; i++) {
    const cursor = addDays(today, -i);
    if (!expectedWeekday(habit, cursor)) continue;
    const key = keyOf(cursor);
    const log = logs.get(key);
    if (log?.state === "skip") continue; // rest day — excluded
    if (key === todayKey && !log) continue; // not due yet
    due++;
    if (countsAsDone(habit, log)) done++;
  }
  return due === 0 ? null : done / due;
}

// ── Current-period progress (drives the cross-habit review) ──────────────────

export interface PeriodProgress {
  done: number;
  target: number;
  met: boolean;
  /** Period label, e.g. "this week" / "this month". */
  label: string;
}

export function periodProgress(
  habit: Habit,
  logs: Map<string, HabitLog>,
  today: Date = new Date(),
): PeriodProgress {
  if (habit.scheduleModel === "flexible") {
    const target = Math.max(1, habit.targetCount ?? 1);
    const done = doneInPeriod(habit, logs, today);
    return {
      done,
      target,
      met: done >= target,
      label: habit.period === "month" ? "this month" : "this week",
    };
  }
  // Fixed: target = expected days this week; done = completed so far.
  const start = startOfWeek(today, { weekStartsOn: 0 });
  let target = 0;
  let done = 0;
  for (let i = 0; i < 7; i++) {
    const cursor = addDays(start, i);
    if (!expectedWeekday(habit, cursor)) continue;
    target++;
    if (countsAsDone(habit, logs.get(keyOf(cursor)))) done++;
  }
  return { done, target, met: target > 0 && done >= target, label: "this week" };
}

export type Trend = "improving" | "steady" | "slipping" | "new";

/**
 * Trend from the two most recently *completed* periods (both fully elapsed, so
 * the comparison is fair). Needs ≥2 completed periods, else "new".
 */
export function trend(
  habit: Habit,
  logs: Map<string, HabitLog>,
  today: Date = new Date(),
): Trend {
  const target = Math.max(1, habit.scheduleModel === "flexible" ? habit.targetCount ?? 1 : 1);
  const lastDone = prevPeriodStart(habit, periodStart(habit, today));
  const prevDone = prevPeriodStart(habit, lastDone);

  const ratio = (start: Date): number | null => {
    if (habit.scheduleModel === "flexible") {
      return doneInPeriod(habit, logs, start) / target;
    }
    // Fixed: completed / expected days in that week.
    let exp = 0;
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const c = addDays(start, i);
      if (!expectedWeekday(habit, c)) continue;
      exp++;
      if (countsAsDone(habit, logs.get(keyOf(c)))) done++;
    }
    return exp === 0 ? null : done / exp;
  };

  const a = ratio(lastDone);
  const b = ratio(prevDone);
  if (a == null || b == null) return "new";
  if (logs.size === 0) return "new";
  const eps = 0.05;
  if (a > b + eps) return "improving";
  if (a < b - eps) return "slipping";
  return "steady";
}

// ── Bundled summary for the UI ───────────────────────────────────────────────

export interface HabitSummary {
  current: number;
  longest: number;
  rate7: number | null;
  rate30: number | null;
  rate90: number | null;
  period: PeriodProgress;
  trend: Trend;
  /** "YYYY-MM-DD" of the most recent done log, or null. */
  lastDone: string | null;
  todayStatus: DayStatus;
  todayLog: HabitLog | undefined;
}

export function summarize(
  habit: Habit,
  logsArr: HabitLog[],
  today: Date = new Date(),
): HabitSummary {
  const logs = indexLogs(logsArr);
  const todayKey = keyOf(today);
  let lastDone: string | null = null;
  for (const [date, log] of logs) {
    if (countsAsDone(habit, log) && (!lastDone || date > lastDone)) lastDone = date;
  }
  return {
    current: currentStreak(habit, logs, today),
    longest: longestStreak(habit, logs, today),
    rate7: completionRate(habit, logs, 7, today),
    rate30: completionRate(habit, logs, 30, today),
    rate90: completionRate(habit, logs, 90, today),
    period: periodProgress(habit, logs, today),
    trend: trend(habit, logs, today),
    lastDone,
    todayStatus: dayStatus(habit, todayKey, logs, today),
    todayLog: logs.get(todayKey),
  };
}

/** Whether the habit is "due" today (expected today / period target unmet). */
export function isDueToday(
  habit: Habit,
  logsArr: HabitLog[],
  today: Date = new Date(),
): boolean {
  const logs = indexLogs(logsArr);
  if (habit.scheduleModel === "flexible") {
    const target = Math.max(1, habit.targetCount ?? 1);
    return doneInPeriod(habit, logs, today) < target;
  }
  return expectedWeekday(habit, today);
}
