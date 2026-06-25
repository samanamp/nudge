import { isToday, isPast, startOfDay } from "date-fns";
import type { Todo } from "./types";

export type GroupKey = "overdue" | "today" | "upcoming" | "someday" | "done";

export interface Group {
  key: GroupKey;
  label: string;
  todos: Todo[];
}

const ORDER: { key: GroupKey; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "someday", label: "Someday" },
  { key: "done", label: "Completed" },
];

function classify(todo: Todo): GroupKey {
  if (todo.completedAt) return "done";
  if (todo.dueAt === undefined) return "someday";
  if (isToday(todo.dueAt)) return "today";
  if (isPast(startOfDay(todo.dueAt))) return "overdue";
  return "upcoming";
}

/** Split todos into ordered, non-empty display groups. */
export function groupTodos(todos: Todo[]): Group[] {
  const buckets = new Map<GroupKey, Todo[]>();
  for (const t of todos) {
    if (t.deletedAt) continue;
    const key = classify(t);
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(t);
  }

  for (const [, list] of buckets) {
    list.sort((a, b) => {
      // Dated items by due time, then by manual sort order, then newest.
      if (a.dueAt !== undefined && b.dueAt !== undefined && a.dueAt !== b.dueAt)
        return a.dueAt - b.dueAt;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.createdAt - a.createdAt;
    });
  }

  return ORDER.map(({ key, label }) => ({
    key,
    label,
    todos: buckets.get(key) ?? [],
  })).filter((g) => g.todos.length > 0);
}
