import Dexie, { type Table } from "dexie";
import { nanoid } from "nanoid";
import type { Todo, Habit, HabitLog } from "./types";
import { noRecurrence } from "./types";
import { nextOccurrence } from "./recurrence";

/** IndexedDB store. The local source of truth — fully usable offline. */
class TodoDB extends Dexie {
  todos!: Table<Todo, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;

  constructor() {
    super("todos");
    this.version(1).stores({
      // Indexes used for querying/sorting; `deletedAt` for future sync filters.
      todos: "id, completedAt, dueAt, sortOrder, deletedAt, updatedAt",
    });
    // v2: habits (§4.10). `[habitId+date]` keeps one log per habit per day and
    // makes "logs for a habit" / "log for a day" fast lookups.
    this.version(2).stores({
      todos: "id, completedAt, dueAt, sortOrder, deletedAt, updatedAt",
      habits: "id, sortOrder, archivedAt, deletedAt, updatedAt",
      habitLogs: "id, habitId, date, [habitId+date], deletedAt, updatedAt",
    });
  }
}

export const db = new TodoDB();

const now = () => Date.now();

export async function createTodo(
  input: Partial<Todo> & { title: string },
): Promise<string> {
  const ts = now();
  const minOrder = await lowestSortOrder();
  const todo: Todo = {
    id: nanoid(),
    title: input.title.trim(),
    notes: input.notes,
    dueAt: input.dueAt,
    recurrence: input.recurrence ?? noRecurrence(),
    reminders: input.reminders ?? [],
    sortOrder: input.sortOrder ?? minOrder - 1,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.todos.add(todo);
  return todo.id;
}

export async function updateTodo(
  id: string,
  patch: Partial<Todo>,
): Promise<void> {
  await db.todos.update(id, { ...patch, updatedAt: now() });
}

/**
 * Toggle completion. Completing a recurring todo rolls it forward to its next
 * occurrence instead of closing it (and keeps it open).
 */
export async function toggleComplete(id: string): Promise<void> {
  const todo = await db.todos.get(id);
  if (!todo) return;

  if (todo.completedAt) {
    await updateTodo(id, { completedAt: undefined });
    return;
  }

  if (todo.recurrence.freq !== "none" && todo.dueAt) {
    const next = nextOccurrence(todo.dueAt, todo.recurrence);
    if (next) {
      await updateTodo(id, { dueAt: next, completedAt: undefined });
      return;
    }
  }
  await updateTodo(id, { completedAt: now() });
}

/** Soft-delete (tombstone) so the deletion can sync later. */
export async function deleteTodo(id: string): Promise<void> {
  await updateTodo(id, { deletedAt: now() });
}

async function lowestSortOrder(): Promise<number> {
  const first = await db.todos.orderBy("sortOrder").first();
  return first?.sortOrder ?? 0;
}

/** Wipe the local store (used on sign-out — data lives on the server). */
export async function clearAllTodos(): Promise<void> {
  await db.todos.clear();
}

/**
 * Merge server todos into the local store (newer-wins per record).
 * Additive only — never deletes local items. Local tasks created while offline
 * survive and get pushed on the next sync. Server-side deletions propagate via
 * the `deletedAt` tombstone field in the pushed todo payload.
 */
export async function mergeServerTodos(serverTodos: Todo[]): Promise<void> {
  await db.transaction("rw", db.todos, async () => {
    for (const raw of serverTodos) {
      if (!raw?.id) continue;
      const s = normalizeTodo(raw);
      const local = await db.todos.get(s.id);
      if (!local || (s.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
        await db.todos.put(s);
      }
    }
  });
}

/** Backfill any missing fields so a partial record can never crash rendering. */
export function normalizeTodo(s: Todo): Todo {
  return {
    ...s,
    recurrence: s.recurrence ?? noRecurrence(),
    reminders: Array.isArray(s.reminders) ? s.reminders : [],
    sortOrder: s.sortOrder ?? 0,
    createdAt: s.createdAt ?? s.updatedAt ?? Date.now(),
    updatedAt: s.updatedAt ?? Date.now(),
  };
}

/** Purge completed todos older than 30 days (retention policy). */
export async function purgeOldCompleted(): Promise<void> {
  const cutoff = now() - 30 * 86_400_000;
  await db.todos
    .filter((t) => t.completedAt !== undefined && t.completedAt < cutoff)
    .modify({ deletedAt: now() });
}
