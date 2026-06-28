import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { normalizeHabit } from "@/lib/habits";
import type { Habit, HabitLog } from "@/lib/types";
import { periodProgress, indexLogs, dayStatus, isDueToday } from "@/lib/habitStats";
import { dayKey } from "@/lib/habits";
import { HabitCard } from "./HabitCard";
import { HabitEditDialog } from "./HabitEditDialog";

export function HabitsView() {
  const [editing, setEditing] = useState<Habit | null>(null);
  const [creating, setCreating] = useState(false);
  const [seedTitle, setSeedTitle] = useState<string | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);

  const openCreate = (title?: string) => {
    setSeedTitle(title);
    setCreating(true);
  };

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

  // Today-focused summary: how many of today's habits are done, plus how many
  // are on track for the period. "Today" leads — it's positive and actionable.
  const review = useMemo(() => {
    const today = dayKey();
    let dueOrDone = 0;
    let doneToday = 0;
    let weekDone = 0;
    let weekTarget = 0;
    for (const h of active) {
      const logs = indexLogs(logsByHabit.get(h.id) ?? []);
      const isDone = dayStatus(h, today, logs) === "done";
      if (isDone || isDueToday(h, logsByHabit.get(h.id) ?? [])) dueOrDone++;
      if (isDone) doneToday++;
      const p = periodProgress(h, logs);
      weekDone += p.done;
      weekTarget += p.target;
    }
    return { dueOrDone, doneToday, weekDone, weekTarget, count: active.length };
  }, [active, logsByHabit]);

  const allTodayDone = review.dueOrDone > 0 && review.doneToday >= review.dueOrDone;

  return (
    <div className="space-y-3 py-4">
      {active.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "grid size-9 place-items-center rounded-lg",
                  allTodayDone ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
                )}
              >
                {allTodayDone ? <Check className="size-5" strokeWidth={2.5} /> : <Sparkles className="size-5" />}
              </div>
              <div>
                <p className="text-[15px] font-semibold leading-tight">
                  {allTodayDone
                    ? "All done for today 🎉"
                    : `${review.doneToday} of ${review.dueOrDone} done today`}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">
                  {review.weekDone} of {review.weekTarget} sessions this week
                </p>
              </div>
            </div>
            <button
              onClick={() => openCreate()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-[var(--color-accent-fg)] shadow-[0_2px_10px_-2px_var(--color-accent-soft)] transition-transform active:scale-95"
            >
              <Plus className="size-3.5" /> Habit
            </button>
          </div>
          {/* Today progress bar */}
          {review.dueOrDone > 0 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className={cn("h-full rounded-full transition-all", allTodayDone ? "bg-emerald-400" : "bg-[var(--color-accent)]")}
                style={{ width: `${Math.round((review.doneToday / review.dueOrDone) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {active.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-[var(--color-accent)]/12 text-3xl">
            🌱
          </div>
          <p className="mt-4 font-display text-lg font-semibold">Build a habit</p>
          <p className="mt-1 max-w-xs text-[13px] text-[var(--color-text-dim)]">
            Track practices like yoga, meditation, or violin. Log each day and watch
            your streaks grow.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {[
              ["🧘", "Meditation"],
              ["🏃", "Run"],
              ["📚", "Read"],
              ["🎻", "Violin"],
            ].map(([icon, title]) => (
              <button
                key={title}
                onClick={() => openCreate(title)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
              >
                <span>{icon}</span> {title}
              </button>
            ))}
          </div>
          <button
            onClick={() => openCreate()}
            className="mt-5 flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-[var(--color-accent-fg)] shadow-[0_2px_10px_-2px_var(--color-accent-soft)]"
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
          initialTitle={seedTitle}
          onClose={() => {
            setEditing(null);
            setCreating(false);
            setSeedTitle(undefined);
          }}
        />
      )}
    </div>
  );
}
