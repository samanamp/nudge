import { addDays, startOfWeek, format } from "date-fns";
import type { Habit, HabitLog } from "@/lib/types";
import { dayStatus, indexLogs, type DayStatus } from "@/lib/habitStats";
import { cn } from "@/lib/cn";

const WEEKS = 13; // ~3 months

const CELL: Record<DayStatus, string> = {
  done: "bg-[var(--color-accent)]",
  skip: "bg-[var(--color-text-faint)]/40",
  miss: "bg-[var(--color-danger)]/25",
  none: "border border-[var(--color-border-strong)] bg-transparent",
  off: "bg-[var(--color-surface-2)]/40",
  future: "bg-transparent",
};

interface Props {
  habit: Habit;
  logs: HabitLog[];
  today?: Date;
  /** Backfill: toggle a past day's "done" state. */
  onToggleDay?: (dateKey: string) => void;
}

export function HabitHeatmap({ habit, logs, today = new Date(), onToggleDay }: Props) {
  const map = indexLogs(logs);
  const end = startOfWeek(today, { weekStartsOn: 0 });
  const start = addDays(end, -(WEEKS - 1) * 7);
  const todayKey = format(today, "yyyy-MM-dd");

  const cols: { key: string; status: DayStatus }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const days: { key: string; status: DayStatus }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const key = format(date, "yyyy-MM-dd");
      days.push({ key, status: dayStatus(habit, key, map, today) });
    }
    cols.push(days);
  }

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {cols.map((days, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {days.map((d) => {
            const interactive = !!onToggleDay && d.status !== "future" && d.status !== "off";
            return (
              <button
                key={d.key}
                type="button"
                disabled={!interactive}
                onClick={interactive ? () => onToggleDay!(d.key) : undefined}
                title={`${d.key}${d.key === todayKey ? " (today)" : ""} · ${d.status}`}
                className={cn(
                  "size-[11px] rounded-[2px] transition-colors",
                  CELL[d.status],
                  d.key === todayKey && "ring-1 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-surface)]",
                  interactive && "cursor-pointer hover:opacity-70",
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
