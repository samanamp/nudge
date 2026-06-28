import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { db } from "@/lib/db";
import { normalizeHabit, toggleDone, dayKey } from "@/lib/habits";
import type { Habit, HabitLog } from "@/lib/types";
import { indexLogs, dayStatus, isDueToday } from "@/lib/habitStats";
import { guessEmoji } from "@/lib/emoji";
import { cn } from "@/lib/cn";

/**
 * Compact strip of today's habits at the top of the main list (§4.10.8) —
 * one-glance daily logging without turning habits into todos.
 */
export function TodayHabits({ onOpenHabits }: { onOpenHabits: () => void }) {
  const habits = useLiveQuery(
    () => db.habits.filter((h) => !h.deletedAt && !h.archivedAt).toArray().then((hs) => hs.map(normalizeHabit)),
    [],
    [] as Habit[],
  );
  const logs = useLiveQuery(
    () => db.habitLogs.filter((l) => !l.deletedAt).toArray(),
    [],
    [] as HabitLog[],
  );

  const today = dayKey();
  const items = useMemo(() => {
    const byHabit = new Map<string, HabitLog[]>();
    for (const l of logs) (byHabit.get(l.habitId) ?? byHabit.set(l.habitId, []).get(l.habitId)!).push(l);
    return habits
      .map((h) => {
        const hl = byHabit.get(h.id) ?? [];
        const done = dayStatus(h, today, indexLogs(hl)) === "done";
        return { habit: h, done, show: done || isDueToday(h, hl) };
      })
      .filter((x) => x.show)
      .sort((a, b) => Number(a.done) - Number(b.done));
  }, [habits, logs, today]);

  if (items.length === 0) return null;

  const remaining = items.filter((i) => !i.done).length;

  return (
    <section className="mb-4">
      <button
        onClick={onOpenHabits}
        className="mb-1.5 flex w-full items-center gap-2 px-3 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-dim)]"
      >
        Habits
        <span className="font-mono text-[10px] font-normal tabular-nums text-[var(--color-text-faint)]">
          {remaining > 0 ? `${remaining} left` : "all done"}
        </span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </button>
      <div className="flex flex-wrap gap-1.5 px-1">
        {items.map(({ habit, done }) => (
          <button
            key={habit.id}
            onClick={() => toggleDone(habit.id, today, habit.targetAmount)}
            title={done ? "Logged — tap to undo" : "Mark done today"}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              done
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)]",
            )}
          >
            <span
              className={cn(
                "grid size-3.5 place-items-center rounded-full border",
                done ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "border-[var(--color-text-faint)]",
              )}
            >
              {done && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            <span>{habit.icon || guessEmoji(habit.title)}</span>
            {habit.title}
          </button>
        ))}
      </div>
    </section>
  );
}
