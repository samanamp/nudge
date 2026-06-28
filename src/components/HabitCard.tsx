import { useState } from "react";
import { Flame, Pencil, TrendingUp, TrendingDown, Minus, Check } from "lucide-react";
import type { Habit, HabitLog } from "@/lib/types";
import { cn } from "@/lib/cn";
import { summarize, isDueToday, type Trend } from "@/lib/habitStats";
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
  const needsToday = isDueToday(habit, logs) && !doneToday;

  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--color-surface)] p-3.5 transition-colors",
        needsToday
          ? "border-[var(--color-border-strong)] border-l-2 border-l-[var(--color-accent)]"
          : "border-[var(--color-border)]",
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleTileClick}
          aria-pressed={doneToday}
          title={doneToday ? "Logged today — tap for options" : "Mark done today"}
          className={cn(
            "relative mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl border text-2xl transition-colors",
            doneToday
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15"
              : needsToday
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 ring-4 ring-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/12"
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
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight">
              {habit.title}
            </h3>
            <button
              onClick={onEdit}
              className="shrink-0 rounded p-1 text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              title="Edit habit"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--color-text-faint)]">
            {doneToday ? (
              <span className="rounded-full bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                ✓ done
              </span>
            ) : needsToday ? (
              <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                do today
              </span>
            ) : null}
            <span>{describeSchedule(habit)}</span>
            {measured && habit.targetAmount != null && (
              <>
                <span className="opacity-40">·</span>
                <span>{habit.targetAmount} {habit.unit ?? ""}</span>
              </>
            )}
            <span className="opacity-40">·</span>
            <span className="font-medium text-[var(--color-text-dim)]">
              {s.period.done}/{s.period.target} {s.period.label}
            </span>
          </p>
        </div>

        {/* Streak — the emotional hook */}
        <div className="shrink-0 pl-1 text-right">
          <div className="flex items-baseline justify-end gap-1">
            <Flame
              className={cn(
                "size-4 self-center",
                s.current > 0 ? "text-amber-400" : "text-[var(--color-text-faint)]",
              )}
            />
            <span className="text-2xl font-bold leading-none tabular-nums">{s.current}</span>
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-text-faint)]">
            best {s.longest}
          </div>
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
      <div className="mt-3 flex items-center gap-4 border-t border-[var(--color-border)] pt-2.5 text-[11px]">
        <Stat label="7d" value={pct(s.rate7)} />
        <Stat label="30d" value={pct(s.rate30)} />
        <Stat label="90d" value={pct(s.rate90)} />
        {tr && (
          <span className={cn("ml-auto flex items-center gap-1 font-medium", tr.cls)}>
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
      <span className="font-semibold text-[var(--color-text)]">{value}</span>{" "}
      <span className="text-[var(--color-text-faint)]">{label}</span>
    </span>
  );
}
