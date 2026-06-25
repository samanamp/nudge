import {
  format,
  isToday,
  isTomorrow,
  isYesterday,
  isThisYear,
  startOfDay,
  differenceInCalendarDays,
} from "date-fns";

/** Compact, human due-date label, e.g. "Today 9:00", "Tue", "Apr 15". */
export function formatDue(dueAt: number): string {
  const d = new Date(dueAt);
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0);
  const time = hasTime ? ` ${format(d, "H:mm")}` : "";

  if (isToday(d)) return `Today${time}`;
  if (isTomorrow(d)) return `Tomorrow${time}`;
  if (isYesterday(d)) return `Yesterday${time}`;

  const days = differenceInCalendarDays(startOfDay(d), startOfDay(new Date()));
  if (days > 1 && days < 7) return `${format(d, "EEE")}${time}`;

  return isThisYear(d)
    ? `${format(d, "MMM d")}${time}`
    : `${format(d, "MMM d, yyyy")}${time}`;
}

/**
 * Age label for undated tasks. Returns null for tasks < 3 days old (too new to matter).
 * Returns a label + urgency tier so the caller can colour it appropriately.
 */
export function taskAge(createdAt: number): { label: string; tier: "faint" | "warn" | "urgent" } | null {
  const days = differenceInCalendarDays(startOfDay(new Date()), startOfDay(new Date(createdAt)));
  if (days < 3) return null;
  if (days < 7) return { label: `${days}d`, tier: "faint" };
  if (days < 14) return { label: "1wk", tier: "faint" };
  if (days < 30) return { label: `${Math.floor(days / 7)}wk`, tier: "warn" };
  if (days < 90) return { label: `${Math.floor(days / 30)}mo`, tier: "urgent" };
  return { label: `${Math.floor(days / 30)}mo`, tier: "urgent" };
}

export function isOverdue(dueAt: number): boolean {
  return dueAt < Date.now();
}

/** Build an epoch-ms due date from a date input + optional "HH:mm" time. */
export function composeDue(dateStr: string, timeStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  let hh = 0;
  let mm = 0;
  if (timeStr) {
    const [h, min] = timeStr.split(":").map(Number);
    hh = h || 0;
    mm = min || 0;
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export const toDateInput = (ms: number) => format(new Date(ms), "yyyy-MM-dd");
export const toTimeInput = (ms: number) => {
  const d = new Date(ms);
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return format(d, "HH:mm");
};
