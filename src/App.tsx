import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Moon, Sun, Command as CommandIcon } from "lucide-react";
import { db, purgeOldCompleted, toggleComplete } from "@/lib/db";
import type { Todo } from "@/lib/types";
import { groupTodos } from "@/lib/grouping";
import { useTheme } from "@/lib/useTheme";
import { QuickAdd } from "@/components/QuickAdd";
import { TodoRow } from "@/components/TodoRow";
import { EditDialog } from "@/components/EditDialog";
import { CommandPalette } from "@/components/CommandPalette";

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [editing, setEditing] = useState<Todo | null>(null);
  const [selected, setSelected] = useState(0);
  const quickAddRef = useRef<HTMLInputElement>(null);

  const todos = useLiveQuery(
    () => db.todos.filter((t) => !t.deletedAt).toArray(),
    [],
    [] as Todo[],
  );

  const groups = useMemo(() => groupTodos(todos), [todos]);
  const flat = useMemo(() => groups.flatMap((g) => g.todos), [groups]);

  // Retention sweep once on load.
  useEffect(() => {
    purgeOldCompleted();
  }, []);

  // Keep selection in range as the list changes.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  // Global keyboard navigation (skips when typing or a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (editing) return;

      if (e.key === "n" && !typing) {
        e.preventDefault();
        quickAddRef.current?.focus();
        return;
      }
      if (typing) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, flat.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        if (flat[selected]) setEditing(flat[selected]);
      } else if (e.key === "x" || e.key === " ") {
        if (flat[selected]) {
          e.preventDefault();
          toggleComplete(flat[selected].id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, selected, editing]);

  const open = todos.filter((t) => !t.completedAt).length;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 sm:px-6">
      {/* Header */}
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-3">
          <div className="brand-mark grid size-9 place-items-center rounded-[11px] text-white">
            <Check className="size-5" strokeWidth={3} />
          </div>
          <div>
            <h1 className="font-display text-[19px] font-bold leading-none tracking-tight">
              Nudge
            </h1>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-text-faint)]">
              <span className="tabular-nums">{open}</span> open
              <span className="text-[var(--color-text-faint)]/50">·</span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400/80" />
                offline
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="rounded-lg p-2 text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </button>
        </div>
      </header>

      {/* Desktop quick-add */}
      <div className="hidden sm:block">
        <QuickAdd ref={quickAddRef} />
      </div>

      {/* Lists */}
      <main className="flex-1 py-4">
        {flat.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2 className="mb-1.5 flex items-center gap-2 px-3 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-dim)]">
                  {group.label}
                  <span className="font-mono text-[10px] font-normal tabular-nums text-[var(--color-text-faint)]">
                    {group.todos.length}
                  </span>
                  <span className="h-px flex-1 bg-[var(--color-border)]" />
                </h2>
                <div>
                  {group.todos.map((todo) => {
                    const index = flat.indexOf(todo);
                    return (
                      <TodoRow
                        key={todo.id}
                        todo={todo}
                        selected={index === selected}
                        onSelect={() => setSelected(index)}
                        onOpen={() => setEditing(todo)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Mobile quick-add (sticky bottom) */}
      <div className="sticky bottom-0 -mx-4 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 safe-bottom sm:hidden">
        <QuickAdd ref={quickAddRef} />
      </div>

      {/* Footer hint (desktop) */}
      <footer className="hidden items-center gap-3 py-3 text-[11px] text-[var(--color-text-faint)] sm:flex">
        <span className="flex items-center gap-1">
          <Kbd>
            <CommandIcon className="inline size-2.5" />K
          </Kbd>{" "}
          command
        </span>
        <span>
          <Kbd>↑↓</Kbd> move
        </span>
        <span>
          <Kbd>⏎</Kbd> open
        </span>
        <span>
          <Kbd>X</Kbd> complete
        </span>
        <span>
          <Kbd>N</Kbd> new
        </span>
      </footer>

      {editing && (
        <EditDialog todo={editing} onClose={() => setEditing(null)} />
      )}
      <CommandPalette
        todos={todos}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNew={() => quickAddRef.current?.focus()}
        onOpen={(t) => setEditing(t)}
      />
    </div>
  );
}

function Empty() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="brand-mark mb-4 grid size-12 place-items-center rounded-2xl text-white opacity-90">
        <Check className="size-6" strokeWidth={3} />
      </div>
      <p className="font-display text-base font-semibold">All clear</p>
      <p className="mt-1 text-xs text-[var(--color-text-faint)]">
        Nothing on your plate. Add a task to get going.
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-dim)]">
      {children}
    </kbd>
  );
}
