import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { nanoid } from "nanoid";
import type { RecurrenceFreq, Reminder, Todo } from "@/lib/types";
import { cn } from "@/lib/cn";
import { composeDue, toDateInput, toTimeInput } from "@/lib/dates";
import { deleteTodo, updateTodo } from "@/lib/db";
import { ReminderEditor } from "./ReminderEditor";

interface Props {
  todo: Todo;
  onClose: () => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EditDialog({ todo, onClose }: Props) {
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [date, setDate] = useState(todo.dueAt ? toDateInput(todo.dueAt) : "");
  const [time, setTime] = useState(todo.dueAt ? toTimeInput(todo.dueAt) : "");
  const [freq, setFreq] = useState<RecurrenceFreq>(todo.recurrence?.freq ?? "none");
  const [interval, setInterval] = useState(todo.recurrence?.interval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(
    todo.recurrence?.weekdays ?? [],
  );
  const [reminders, setReminders] = useState<Reminder[]>(todo.reminders);
  const [tags, setTags] = useState((todo.tags ?? []).join(", "));
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

  const save = async () => {
    if (!title.trim()) return;
    const parsedTags = tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    await updateTodo(todo.id, {
      title: title.trim(),
      notes: notes.trim() || undefined,
      dueAt: composeDue(date, time),
      recurrence: {
        freq,
        interval: Math.max(1, interval),
        weekdays: freq === "weekly" ? weekdays : undefined,
      },
      reminders,
      tags: parsedTags,
    });
    onClose();
  };

  const remove = async () => {
    await deleteTodo(todo.id);
    onClose();
  };

  const toggleWeekday = (d: number) =>
    setWeekdays((w) =>
      w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort(),
    );

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
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-dim)]">
            Edit task
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full bg-transparent text-base font-medium outline-none placeholder:text-[var(--color-text-faint)]"
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-faint)]"
          />

          <Field label="Tags">
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="work, finance, health…"
              className="control flex-1"
            />
          </Field>

          {/* Schedule */}
          <Field label="When">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="control"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date}
              className="control"
            />
          </Field>

          {/* Recurrence */}
          <Field label="Repeat">
            <select
              value={freq}
              onChange={(e) => setFreq(e.target.value as RecurrenceFreq)}
              className="control"
            >
              <option value="none">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            {freq !== "none" && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
                every
                <input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  className="control w-14"
                />
                {{ daily: "days", weekly: "weeks", monthly: "months", yearly: "years" }[freq]}
              </label>
            )}
          </Field>

          {freq === "weekly" && (
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
          )}

          {/* Reminders */}
          <ReminderEditor
            reminders={reminders}
            disabled={!date}
            onChange={setReminders}
            makeId={() => nanoid()}
          />
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 safe-bottom">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-dim)]">
                Delete this task?
              </span>
              <button
                onClick={remove}
                className="rounded-md bg-[var(--color-danger)] px-2.5 py-1.5 text-xs font-medium text-white"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-md px-2 py-1.5 text-xs text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-danger)]"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-md bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] shadow-[0_2px_10px_-2px_var(--color-accent-soft)] transition-transform active:scale-95"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-[var(--color-text-dim)]">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
