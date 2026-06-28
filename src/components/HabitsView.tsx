import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { normalizeHabit } from "@/lib/habits";
import type { Habit, HabitLog } from "@/lib/types";
import { periodProgress, indexLogs } from "@/lib/habitStats";
import { HabitCard } from "./HabitCard";
import { HabitEditDialog } from "./HabitEditDialog";

export function HabitsView() {
  const [editing, setEditing] = useState<Habit | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const habits = useLiveQuery(
    () => db.habits.filter((h) => !h.deletedAt).toArray().then((hs) => hs.map(normalizeHabit)),
    [],
    [] as Habit[],
  );
  const logs = useLiveQuery(
    () => db.habitLogs.filter((l) => !l.deletedAt).toArray(),
    [],
    [] as HabitLog[],
  );

  const logsByHabit = useMemo(() => {
    const m = new Map<string, HabitLog[]>();
    for (const l of logs) (m.get(l.habitId) ?? m.set(l.habitId, []).get(l.habitId)!).push(l);
    return m;
  }, [logs]);

  const active = useMemo(
    () => habits.filter((h) => !h.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder),
    [habits],
  );
  const archived = useMemo(() => habits.filter((h) => !!h.archivedAt), [habits]);

  // Cross-habit review: how many habits are on track this period.
  const review = useMemo(() => {
    let met = 0;
    let totalDone = 0;
    let totalTarget = 0;
    for (const h of active) {
      const p = periodProgress(h, indexLogs(logsByHabit.get(h.id) ?? []));
      if (p.met) met++;
      totalDone += p.done;
      totalTarget += p.target;
    }
    return { met, count: active.length, totalDone, totalTarget };
  }, [active, logsByHabit]);

  return (
    <div className="space-y-3 py-4">
      {active.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-4 text-[var(--color-accent)]" />
            <div>
              <p className="text-[13px] font-medium">
                {review.met}/{review.count} habits on track
              </p>
              <p className="text-[11px] text-[var(--color-text-faint)]">
                {review.totalDone}/{review.totalTarget} sessions this period
              </p>
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] transition-transform active:scale-95"
          >
            <Plus className="size-3.5" /> Habit
          </button>
        </div>
      )}

      {active.length === 0 ? (
        <div className="grid place-items-center py-20 text-center">
          <p className="font-display text-base font-semibold">Build a habit</p>
          <p className="mt-1 max-w-xs text-xs text-[var(--color-text-faint)]">
            Track practices like yoga, meditation, or violin. Log each day and watch
            your streaks grow.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-xs font-medium text-[var(--color-accent-fg)]"
          >
            <Plus className="size-3.5" /> New habit
          </button>
        </div>
      ) : (
        <div className="group space-y-2.5">
          {active.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              logs={logsByHabit.get(h.id) ?? []}
              onEdit={() => setEditing(h)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowArchived((s) => !s)}
            className="w-full py-1.5 text-center text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
          >
            {showArchived ? "Hide archived" : `Show ${archived.length} archived`}
          </button>
          {showArchived && (
            <div className="space-y-2.5 opacity-60">
              {archived.map((h) => (
                <HabitCard key={h.id} habit={h} logs={logsByHabit.get(h.id) ?? []} onEdit={() => setEditing(h)} />
              ))}
            </div>
          )}
        </div>
      )}

      {(creating || editing) && (
        <HabitEditDialog
          habit={editing ?? undefined}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
