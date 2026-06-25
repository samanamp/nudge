import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  isAfter,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from "date-fns";
import type { RecurrenceRule } from "./types";

/**
 * Given a recurring todo's current due date, compute the next due date strictly
 * after `from` (defaults to the due date itself). Returns null for one-off todos.
 *
 * Weekly rules honour `weekdays`; other frequencies simply step by `interval`.
 */
export function nextOccurrence(
  dueAt: number,
  rule: RecurrenceRule,
  from: number = dueAt,
): number | null {
  if (rule.freq === "none") return null;
  const interval = Math.max(1, rule.interval || 1);
  const due = new Date(dueAt);
  const after = new Date(Math.max(from, dueAt - 1));

  if (rule.freq === "weekly") {
    return nextWeekly(due, after, interval, rule.weekdays);
  }

  let next = due;
  const step = (d: Date): Date => {
    switch (rule.freq) {
      case "daily":
        return addDays(d, interval);
      case "monthly":
        return addMonths(d, interval);
      case "yearly":
        return addYears(d, interval);
      default:
        return addDays(d, interval);
    }
  };
  // Advance until strictly after `after`. Cap iterations defensively.
  for (let i = 0; i < 1000 && !isAfter(next, after); i++) {
    next = step(next);
  }
  return next.getTime();
}

function nextWeekly(
  due: Date,
  after: Date,
  interval: number,
  weekdays?: number[],
): number {
  const days =
    weekdays && weekdays.length > 0
      ? [...new Set(weekdays)].sort((a, b) => a - b)
      : [due.getDay()];

  // Scan forward day-by-day from the day after `after`, keeping the due time of
  // day. Within an N-week cadence we only accept weeks aligned to the anchor.
  const anchorWeek = startOfWeek(due);
  let cursor = atTimeOf(due, addDays(stripTime(after), 1));
  for (let i = 0; i < 3700; i++) {
    if (days.includes(cursor.getDay())) {
      const weeksApart = Math.floor(
        (startOfWeek(cursor).getTime() - anchorWeek.getTime()) /
          (7 * 86_400_000),
      );
      if (weeksApart % interval === 0 && isAfter(cursor, after)) {
        return cursor.getTime();
      }
    }
    cursor = addDays(cursor, 1);
  }
  // Fallback: a clean interval jump.
  return addWeeks(due, interval).getTime();
}

const stripTime = (d: Date): Date =>
  setMilliseconds(setSeconds(setMinutes(setHours(d, 0), 0), 0), 0);

const atTimeOf = (time: Date, day: Date): Date =>
  setMilliseconds(
    setSeconds(
      setMinutes(setHours(day, time.getHours()), time.getMinutes()),
      time.getSeconds(),
    ),
    0,
  );

function startOfWeek(d: Date): Date {
  const s = stripTime(d);
  return addDays(s, -s.getDay()); // week starts Sunday
}

/** Human-readable label for a recurrence rule, e.g. "Every 2 days". */
export function describeRecurrence(rule: RecurrenceRule): string {
  if (rule.freq === "none") return "";
  const n = Math.max(1, rule.interval || 1);
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[
    rule.freq
  ];
  if (rule.freq === "weekly" && rule.weekdays && rule.weekdays.length > 0) {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const which = [...rule.weekdays].sort((a, b) => a - b).map((d) => names[d]);
    return n === 1 ? `Weekly · ${which.join(" ")}` : `Every ${n} wks · ${which.join(" ")}`;
  }
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}
