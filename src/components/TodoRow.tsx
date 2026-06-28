import { Repeat, Bell, AlarmClock } from "lucide-react";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatDue, isOverdue, taskAge } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";
import { toggleComplete } from "@/lib/db";
import { Checkbox } from "./Checkbox";

interface Props {
  todo: Todo;
  selected: boolean;
  flash?: boolean;
  /** Mid completion exit-animation. */
  completing?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  onOpen: () => void;
  onTagClick?: (tag: string) => void;
}

export function TodoRow({ todo, selected, flash, completing, onToggle, onSelect, onOpen, onTagClick }: Props) {
  const done = !!todo.completedAt || !!completing;
  const recurs = (todo.recurrence?.freq ?? "none") !== "none";
  const overdue = todo.dueAt !== undefined && !done && isOverdue(todo.dueAt);
  const hasNag = todo.reminders.some((r) => r.type === "recurring");
  const hasReminder = todo.reminders.length > 0;
  const tags = todo.tags ?? [];
  const age = !done && todo.dueAt === undefined ? taskAge(todo.createdAt) : null;

  return (
    <div
      role="button"
      tabIndex={-1}
      onMouseEnter={onSelect}
      onClick={onOpen}
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-row)] px-3 py-2 transition-colors duration-150",
        selected ? "bg-[var(--color-surface-2)]" : "hover:bg-[var(--color-surface)]",
        flash && "animate-flash",
        completing && "animate-task-out pointer-events-none",
      )}
    >
      {/* Selection accent bar */}
      <span
        className={cn(
          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--color-accent)] transition-all duration-150",
          selected ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
        )}
      />

      <Checkbox checked={done} onToggle={onToggle ?? (() => toggleComplete(todo.id))} />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13.5px] leading-5",
            done && "text-[var(--color-text-faint)] line-through",
          )}
        >
          {todo.title}
        </div>

        {!done && (
          <>
            {todo.notes && (
              <p className="truncate text-xs text-[var(--color-text-faint)] pt-0.5">
                {todo.notes}
              </p>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagClick?.(tag);
                    }}
                    className="rounded px-1.5 py-px text-[10px] font-medium bg-[var(--color-accent)]/12 text-[var(--color-accent-text)] hover:bg-[var(--color-accent)]/20 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Meta badges */}
      <div className="flex shrink-0 items-center gap-2 text-[var(--color-text-dim)]">
        {recurs && (
          <span className="flex items-center gap-1 text-[11px]" title={describeRecurrence(todo.recurrence)}>
            <Repeat className="size-3" />
          </span>
        )}
        {hasReminder && (
          <span title="Has reminder">
            {hasNag ? <AlarmClock className="size-3" /> : <Bell className="size-3" />}
          </span>
        )}
        {age && (
          <span
            title={`Added ${age.label} ago — no due date set`}
            className={cn(
              "tabular-nums text-[11px]",
              age.tier === "faint" && "text-[var(--color-text-faint)]",
              age.tier === "warn" && "text-amber-400/80",
              age.tier === "urgent" && "font-medium text-orange-400",
            )}
          >
            {age.label}
          </span>
        )}
        {todo.dueAt !== undefined && (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
              overdue
                ? "bg-[var(--color-danger)]/12 text-[var(--color-danger)] font-medium"
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
