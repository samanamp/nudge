import { Bell, AlarmClock, Plus, X } from "lucide-react";
import type { Reminder } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Props {
  reminders: Reminder[];
  disabled: boolean;
  onChange: (next: Reminder[]) => void;
  makeId: () => string;
}

const OFFSETS: { label: string; minutes: number }[] = [
  { label: "At time", minutes: 0 },
  { label: "10m before", minutes: 10 },
  { label: "1h before", minutes: 60 },
  { label: "1d before", minutes: 1440 },
];

/**
 * Edit a todo's reminders. Two shapes:
 *  - one-shot: a single ping at an offset before due.
 *  - recurring "nag": repeat every N days from a window until done.
 * (Delivery is wired up server-side in a later milestone.)
 */
export function ReminderEditor({ reminders, disabled, onChange, makeId }: Props) {
  const update = (id: string, patch: Partial<Reminder>) =>
    onChange(reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(reminders.filter((r) => r.id !== id));

  const addOneShot = () =>
    onChange([
      ...reminders,
      {
        id: makeId(),
        type: "one_shot",
        channels: ["email", "push"],
        offsetMinutes: 60,
      },
    ]);

  const addNag = () =>
    onChange([
      ...reminders,
      {
        id: makeId(),
        type: "recurring",
        channels: ["email", "push"],
        windowStartMinutes: 7 * 1440,
        cadenceDays: 1,
        timeOfDay: "09:00",
        stop: "on_complete",
      },
    ]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-xs text-[var(--color-text-dim)]">
          Remind
        </span>
        <div className="flex flex-1 flex-wrap gap-2">
          <AddButton disabled={disabled} onClick={addOneShot} icon={<Bell className="size-3" />}>
            Reminder
          </AddButton>
          <AddButton disabled={disabled} onClick={addNag} icon={<AlarmClock className="size-3" />}>
            Repeat until done
          </AddButton>
        </div>
      </div>

      {disabled && reminders.length === 0 && (
        <p className="pl-[4.25rem] text-[11px] text-[var(--color-text-faint)]">
          Set a date to add reminders.
        </p>
      )}

      <div className="space-y-1.5 pl-[4.25rem]">
        {reminders.map((r) =>
          r.type === "one_shot" ? (
            <Row key={r.id} onRemove={() => remove(r.id)}>
              <Bell className="size-3 shrink-0 text-[var(--color-text-dim)]" />
              <select
                value={r.offsetMinutes ?? 60}
                onChange={(e) =>
                  update(r.id, { offsetMinutes: Number(e.target.value) })
                }
                className="control"
              >
                {OFFSETS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Row>
          ) : (
            <Row key={r.id} onRemove={() => remove(r.id)}>
              <AlarmClock className="size-3 shrink-0 text-[var(--color-text-dim)]" />
              <span className="text-[11px] text-[var(--color-text-dim)]">every</span>
              <input
                type="number"
                min={1}
                value={r.cadenceDays ?? 1}
                onChange={(e) =>
                  update(r.id, { cadenceDays: Math.max(1, Number(e.target.value)) })
                }
                className="control w-12"
              />
              <span className="text-[11px] text-[var(--color-text-dim)]">d at</span>
              <input
                type="time"
                value={r.timeOfDay ?? "09:00"}
                onChange={(e) => update(r.id, { timeOfDay: e.target.value })}
                className="control"
              />
              <span className="text-[11px] text-[var(--color-text-dim)]">from</span>
              <select
                value={r.windowStartMinutes ?? 7 * 1440}
                onChange={(e) =>
                  update(r.id, { windowStartMinutes: Number(e.target.value) })
                }
                className="control"
              >
                <option value={1 * 1440}>1d before</option>
                <option value={3 * 1440}>3d before</option>
                <option value={7 * 1440}>1wk before</option>
                <option value={14 * 1440}>2wk before</option>
              </select>
            </Row>
          ),
        )}
      </div>
    </div>
  );
}

function AddButton({
  children,
  icon,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-dim)]",
        "hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      <Plus className="size-3" />
      {icon}
      {children}
    </button>
  );
}

function Row({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-[var(--color-bg)] px-2 py-1.5">
      {children}
      <button
        onClick={onRemove}
        className="ml-auto rounded p-0.5 text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
