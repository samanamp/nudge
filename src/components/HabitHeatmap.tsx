import { addDays, startOfWeek, format } from "date-fns";
import type { Habit, HabitLog } from "@/lib/types";
import { dayStatus, indexLogs, type DayStatus } from "@/lib/habitStats";
import { cn } from "@/lib/cn";

const WEEKS = 26; // ~6 months — fills the card width as a contribution graph

// Filled squares (GitHub-style); empty days are a faint fill, never an outline.
const CELL: Record<DayStatus, string> = {
  done: "bg-[var(--color-accent)]",
  skip: "bg-[var(--color-text-dim)]/40",
  miss: "bg-[var(--color-danger)]/20",
  none: "bg-[var(--color-surface-2)]",
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

  // Column-major (week by week) to match grid-auto-flow: column.
  const cells: { key: string; status: DayStatus }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const key = format(date, "yyyy-MM-dd");
      cells.push({ key, status: dayStatus(habit, key, map, today) });
    }
  }

  return (
    <div
      className="grid w-full gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))`,
        gridTemplateRows: "repeat(7, auto)",
        gridAutoFlow: "column",
      }}
    >
      {cells.map((c) => {
        const interactive = !!onToggleDay && c.status !== "future" && c.status !== "off";
        return (
          <button
            key={c.key}
            type="button"
            disabled={!interactive}
            onClick={interactive ? () => onToggleDay!(c.key) : undefined}
            title={`${c.key}${c.key === todayKey ? " (today)" : ""} · ${c.status}`}
            className={cn(
              "aspect-square rounded-[2px] transition-colors",
              CELL[c.status],
              c.key === todayKey && "ring-1 ring-[var(--color-accent)]",
              interactive && "cursor-pointer hover:opacity-70",
            )}
          />
        );
      })}
    </div>
  );
}
