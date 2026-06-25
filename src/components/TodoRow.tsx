import { Repeat, Bell, AlarmClock } from "lucide-react";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatDue, isOverdue } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";
import { toggleComplete } from "@/lib/db";
import { Checkbox } from "./Checkbox";

interface Props {
  todo: Todo;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export function TodoRow({ todo, selected, onSelect, onOpen }: Props) {
  const done = !!todo.completedAt;
  const recurs = (todo.recurrence?.freq ?? "none") !== "none";
  const overdue = todo.dueAt !== undefined && !done && isOverdue(todo.dueAt);
  const hasNag = todo.reminders.some((r) => r.type === "recurring");
  const hasReminder = todo.reminders.length > 0;

  return (
    <div
      role="button"
      tabIndex={-1}
      onMouseEnter={onSelect}
      onClick={onOpen}
      className={cn(
        "group relative flex items-center gap-3 rounded-[var(--radius-row)] px-3 py-2 transition-colors duration-150",
        selected
          ? "bg-[var(--color-surface-2)]"
          : "hover:bg-[var(--color-surface)]",
      )}
    >
      {/* Selection accent bar */}
      <span
        className={cn(
          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--color-accent)] transition-all duration-150",
          selected ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
        )}
      />

      <Checkbox checked={done} onToggle={() => toggleComplete(todo.id)} />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13.5px] leading-5",
            done && "text-[var(--color-text-faint)] line-through",
          )}
        >
          {todo.title}
        </div>
        {todo.notes && !done && (
          <div className="truncate text-xs text-[var(--color-text-faint)]">
            {todo.notes}
          </div>
        )}
      </div>

      {/* Meta badges */}
      <div className="flex shrink-0 items-center gap-2 text-[var(--color-text-dim)]">
        {recurs && (
          <span
            className="flex items-center gap-1 text-[11px]"
            title={describeRecurrence(todo.recurrence)}
          >
            <Repeat className="size-3" />
          </span>
        )}
        {hasReminder && (
          <span title="Has reminder">
            {hasNag ? (
              <AlarmClock className="size-3" />
            ) : (
              <Bell className="size-3" />
            )}
          </span>
        )}
        {todo.dueAt !== undefined && (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
              overdue
                ? "bg-[var(--color-danger)]/12 text-[var(--color-danger)]"
                : "text-[var(--color-text-dim)]",
            )}
          >
            {formatDue(todo.dueAt)}
          </span>
        )}
      </div>
    </div>
  );
}
