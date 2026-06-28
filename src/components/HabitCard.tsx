import { useState } from "react";
import { Flame, Pencil, TrendingUp, TrendingDown, Minus, Check } from "lucide-react";
import type { Habit, HabitLog } from "@/lib/types";
import { cn } from "@/lib/cn";
import { summarize, type Trend } from "@/lib/habitStats";
import { describeSchedule, toggleDone, logHabit, clearLog, dayKey } from "@/lib/habits";
import { guessEmoji } from "@/lib/emoji";
import { HabitHeatmap } from "./HabitHeatmap";

interface Props {
  habit: Habit;
  logs: HabitLog[];
  onEdit: () => void;
}

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);

const TREND: Record<Trend, { icon: typeof Minus; cls: string; label: string } | null> = {
  improving: { icon: TrendingUp, cls: "text-emerald-400", label: "improving" },
  slipping: { icon: TrendingDown, cls: "text-[var(--color-danger)]", label: "slipping" },
  steady: { icon: Minus, cls: "text-[var(--color-text-faint)]", label: "steady" },
  new: null,
};

export function HabitCard({ habit, logs, onEdit }: Props) {
  const s = summarize(habit, logs);
  const measured = habit.measurement === "measured";
  const doneToday = s.todayStatus === "done";
  const [editingAmount, setEditingAmount] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [amount, setAmount] = useState<string>(
    String(habit.targetAmount ?? s.todayLog?.amount ?? ""),
  );

  const logMeasured = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return;
    await logHabit(habit.id, { date: dayKey(), state: "done", amount: n });
    setEditingAmount(false);
    setShowActions(false);
  };

  // Tapping the tile: log when not done; when already done, open an actions
  // menu instead of silently clearing it (avoids accidental un-logging).
  const handleTileClick = () => {
    if (doneToday) setShowActions((v) => !v);
    else if (measured) setEditingAmount((v) => !v);
    else toggleDone(habit.id);
  };

  const tr = TREND[s.trend];

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleTileClick}
          aria-pressed={doneToday}
          title={doneToday ? "Logged today — tap for options" : "Mark done today"}
          className={cn(
            "relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border text-xl transition-colors",
            doneToday
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/12"
              : "border-[var(--color-border-strong)] hover:border-[var(--color-accent)]",
          )}
        >
          <span>{habit.icon || guessEmoji(habit.title)}</span>
          {doneToday && (
            <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-surface)]">
              <Check className="size-2.5 text-[var(--color-accent-fg)]" strokeWidth={3.5} />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-medium leading-tight">{habit.title}</h3>
            <button
              onClick={onEdit}
              className="rounded p-1 text-[var(--color-text-faint)] opacity-0 transition-opacity hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] group-hover:opacity-100 sm:opacity-60"
              title="Edit habit"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-text-faint)]">
            <span>{describeSchedule(habit)}</span>
            {measured && habit.targetAmount != null && (
              <>
                <span className="opacity-40">·</span>
                <span>
                  {habit.targetAmount} {habit.unit ?? ""} target
                </span>
              </>
            )}
            <span className="opacity-40">·</span>
            <span className="font-medium text-[var(--color-text-dim)]">
              {s.period.done}/{s.period.target} {s.period.label}
            </span>
          </p>
        </div>

        {/* Streak */}
        <div className="shrink-0 text-right">
          <div
            className={cn(
              "flex items-center justify-end gap-1 text-[15px] font-semibold tabular-nums",
              s.current > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text-faint)]",
            )}
          >
            <Flame className="size-3.5" />
            {s.current}
          </div>
          <div className="text-[10px] text-[var(--color-text-faint)]">best {s.longest}</div>
        </div>
      </div>

      {/* Actions for an already-logged day (no accidental clearing) */}
      {showActions && doneToday && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--color-text-dim)]">
            Logged today{measured && s.todayLog?.amount != null ? ` · ${s.todayLog.amount} ${habit.unit ?? ""}` : ""}.
          </span>
          {measured && (
            <button
              onClick={() => {
                setAmount(String(s.todayLog?.amount ?? habit.targetAmount ?? ""));
                setEditingAmount(true);
                setShowActions(false);
              }}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 font-medium text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              Edit amount
            </button>
          )}
          <button
            onClick={() => {
              clearLog(habit.id);
              setShowActions(false);
            }}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 font-medium text-[var(--color-text-dim)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
          >
            Clear today
          </button>
          <button
            onClick={() => setShowActions(false)}
            className="rounded-md px-2 py-1 text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline measured logging */}
      {editingAmount && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="number"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") logMeasured();
              if (e.key === "Escape") setEditingAmount(false);
            }}
            className="control w-24"
            placeholder="amount"
          />
          <span className="text-xs text-[var(--color-text-dim)]">{habit.unit}</span>
          <button
            onClick={logMeasured}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)]"
          >
            Log
          </button>
        </div>
      )}

      {/* Heatmap */}
      <div className="mt-3">
        <HabitHeatmap
          habit={habit}
          logs={logs}
          onToggleDay={(date) => toggleDone(habit.id, date, habit.targetAmount)}
        />
      </div>

      {/* Rates + trend */}
      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-[var(--color-text-faint)]">
        <Stat label="7d" value={pct(s.rate7)} />
        <Stat label="30d" value={pct(s.rate30)} />
        <Stat label="90d" value={pct(s.rate90)} />
        {tr && (
          <span className={cn("ml-auto flex items-center gap-1", tr.cls)}>
            <tr.icon className="size-3" />
            {tr.label}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="tabular-nums">
      <span className="font-medium text-[var(--color-text-dim)]">{value}</span> {label}
    </span>
  );
}
