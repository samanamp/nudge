import { useEffect, useState } from "react";
import { Trash2, X, Archive } from "lucide-react";
import type { Habit, HabitMeasurement, HabitPeriod, HabitScheduleModel, ReminderChannel } from "@/lib/types";
import { cn } from "@/lib/cn";
import { createHabit, updateHabit, deleteHabit, archiveHabit } from "@/lib/habits";
import { guessEmoji } from "@/lib/emoji";

interface Props {
  /** Omit for create mode. */
  habit?: Habit;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HabitEditDialog({ habit, onClose, onDeleted }: Props) {
  const creating = !habit;
  const [title, setTitle] = useState(habit?.title ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? "");
  const [notes, setNotes] = useState(habit?.notes ?? "");

  const [model, setModel] = useState<HabitScheduleModel>(habit?.scheduleModel ?? "fixed_weekdays");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [period, setPeriod] = useState<HabitPeriod>(habit?.period ?? "week");
  const [targetCount, setTargetCount] = useState(habit?.targetCount ?? 5);

  const [measurement, setMeasurement] = useState<HabitMeasurement>(habit?.measurement ?? "binary");
  const [unit, setUnit] = useState(habit?.unit ?? "min");
  const [targetAmount, setTargetAmount] = useState(habit?.targetAmount ?? 20);
  const [strictTarget, setStrictTarget] = useState(habit?.countDoneOnlyIfTarget ?? false);

  const [timeOfDay, setTimeOfDay] = useState(habit?.timeOfDay ?? "");
  const [channels, setChannels] = useState<ReminderChannel[]>(habit?.channels ?? []);
  const [escalate, setEscalate] = useState(habit?.escalate ?? false);
  const [streakAtRisk, setStreakAtRisk] = useState(habit?.streakAtRisk ?? false);

  const [tags, setTags] = useState((habit?.tags ?? []).join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const toggleWeekday = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  const toggleChannel = (c: ReminderChannel) =>
    setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  const save = async () => {
    if (!title.trim()) return;
    const parsedTags = tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const patch: Partial<Habit> = {
      title: title.trim(),
      icon: icon.trim() || undefined,
      notes: notes.trim() || undefined,
      scheduleModel: model,
      weekdays: model === "fixed_weekdays" ? weekdays : undefined,
      period: model === "flexible" ? period : undefined,
      targetCount: model === "flexible" ? Math.max(1, targetCount) : undefined,
      measurement,
      unit: measurement === "measured" ? unit.trim() || undefined : undefined,
      targetAmount: measurement === "measured" ? targetAmount : undefined,
      countDoneOnlyIfTarget: measurement === "measured" ? strictTarget : undefined,
      timeOfDay: timeOfDay || undefined,
      channels,
      escalate: escalate || undefined,
      streakAtRisk: streakAtRisk || undefined,
      tags: parsedTags,
    };
    if (creating) await createHabit({ title: title.trim(), ...patch });
    else await updateHabit(habit!.id, patch);
    onClose();
  };

  const remove = async () => {
    if (!habit) return;
    await deleteHabit(habit.id);
    onClose();
    onDeleted?.(habit.id);
  };

  return (
    <div
      className="animate-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "animate-sheet flex max-h-[90vh] w-full flex-col overflow-y-auto border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl",
          "rounded-t-2xl sm:max-w-lg sm:rounded-2xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <span className="text-[11px] font-medium text-[var(--color-text-dim)]">
            {creating ? "New habit" : "Edit habit"}
          </span>
          <button onClick={onClose} className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value.slice(0, 2))}
              placeholder={title ? guessEmoji(title) : "🧘"}
              title="Leave blank to auto-pick an emoji"
              className="w-12 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-2 text-center text-lg outline-none focus:border-[var(--color-accent)]"
            />
            <input
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Habit name (e.g. Meditation)"
              className="flex-1 border-b border-[var(--color-border)] bg-transparent pb-2 text-base font-medium outline-none placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)]"
            />
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-faint)]"
          />

          {/* Schedule */}
          <Field label="Schedule">
            <Seg
              options={[
                { v: "fixed_weekdays", l: "Specific days" },
                { v: "flexible", l: "Times per period" },
              ]}
              value={model}
              onChange={(v) => setModel(v as HabitScheduleModel)}
            />
          </Field>

          {model === "fixed_weekdays" ? (
            <div className="flex gap-1">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => toggleWeekday(i)}
                  className={cn(
                    "h-8 flex-1 rounded-md border text-[11px] transition-colors",
                    weekdays.includes(i)
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                      : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)]",
                  )}
                >
                  {d[0]}
                </button>
              ))}
            </div>
          ) : (
            <Field label="Target">
              <input
                type="number"
                min={1}
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                className="control w-16"
              />
              <span className="text-xs text-[var(--color-text-dim)]">times per</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value as HabitPeriod)} className="control">
                <option value="week">week</option>
                <option value="month">month</option>
              </select>
            </Field>
          )}

          {/* Measurement */}
          <Field label="Track">
            <Seg
              options={[
                { v: "binary", l: "Done / not" },
                { v: "measured", l: "An amount" },
              ]}
              value={measurement}
              onChange={(v) => setMeasurement(v as HabitMeasurement)}
            />
          </Field>

          {measurement === "measured" && (
            <>
              <Field label="Amount">
                <input
                  type="number"
                  min={0}
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(Number(e.target.value))}
                  className="control w-20"
                />
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="min, reps…"
                  className="control w-24"
                />
                <span className="text-xs text-[var(--color-text-dim)]">per session</span>
              </Field>
              <Check2 checked={strictTarget} onChange={setStrictTarget}>
                Only count a session if it meets the target
              </Check2>
            </>
          )}

          {/* Alerting */}
          <Field label="Remind">
            <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className="control" />
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
              <input type="checkbox" checked={channels.includes("push")} onChange={() => toggleChannel("push")} />
              push
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
              <input type="checkbox" checked={channels.includes("email")} onChange={() => toggleChannel("email")} />
              email
            </label>
          </Field>
          {timeOfDay && (
            <div className="space-y-1.5 pl-[68px]">
              <Check2 checked={escalate} onChange={setEscalate}>
                Follow-up nudge if not logged by end of day
              </Check2>
              <Check2 checked={streakAtRisk} onChange={setStreakAtRisk}>
                Warn when my streak is about to break
              </Check2>
            </div>
          )}

          <Field label="Tags">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="health, fitness…"
              className="control flex-1"
            />
          </Field>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 safe-bottom">
          {!creating ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-dim)]">Delete habit & history?</span>
                <button onClick={remove} className="rounded-md bg-[var(--color-danger)] px-2.5 py-1.5 text-xs font-medium text-white">
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1.5 text-xs text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]">
                  Keep
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => habit && archiveHabit(habit.id, !habit.archivedAt).then(onClose)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
                >
                  <Archive className="size-3.5" /> {habit?.archivedAt ? "Unarchive" : "Archive"}
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]">
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-md bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] shadow-[0_2px_10px_-2px_var(--color-accent-soft)] transition-transform active:scale-95"
            >
              {creating ? "Create" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-14 shrink-0 pt-1.5 text-xs text-[var(--color-text-dim)]">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: { v: string; l: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg border border-[var(--color-border)] p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors",
            value === o.v
              ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Check2({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
