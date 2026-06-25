import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Moon, Sun, Command as CommandIcon, RefreshCw, X } from "lucide-react";
import { db, normalizeTodo, purgeOldCompleted, toggleComplete, updateTodo } from "@/lib/db";
import type { Todo } from "@/lib/types";
import { groupTodos } from "@/lib/grouping";
import { useTheme } from "@/lib/useTheme";
import { useSession, usePushSync, usePullOnLogin, useOnlineStatus } from "@/lib/session";
import { useInAppReminders } from "@/lib/notify";
import { QuickAdd } from "@/components/QuickAdd";
import { TodoRow } from "@/components/TodoRow";
import { EditDialog } from "@/components/EditDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { AccountMenu } from "@/components/AccountMenu";
import { SignInScreen } from "@/components/SignInScreen";

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [editing, setEditing] = useState<Todo | null>(null);
  const [selected, setSelected] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const lastAddedTimer = useRef<number | undefined>(undefined);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const session = useSession();
  const online = useOnlineStatus();

  // Toast for undo-delete
  const [toast, setToast] = useState<{ msg: string; undo?: () => void; key: number } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((msg: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    const key = Date.now();
    setToast({ msg, undo, key });
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const todos = useLiveQuery(
    () => db.todos.filter((t) => !t.deletedAt).toArray().then((ts) => ts.map(normalizeTodo)),
    [],
    [] as Todo[],
  );

  const { syncing, syncNow } = usePullOnLogin(session.status, session.email);
  const { lastSyncedAt } = usePushSync(todos, session.status === "in");
  useInAppReminders(todos);

  useEffect(() => {
    if (location.search.includes("auth=")) {
      session.refresh();
      window.history.replaceState({}, "", location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { purgeOldCompleted(); }, []);

  // Tag filter: filter todos before grouping
  const filteredTodos = useMemo(
    () => (activeTag ? todos.filter((t) => t.tags?.includes(activeTag)) : todos),
    [todos, activeTag],
  );

  const groups = useMemo(() => {
    const all = groupTodos(filteredTodos);
    return showCompleted ? all : all.filter((g) => g.key !== "done");
  }, [filteredTodos, showCompleted]);

  // Keyboard navigation excludes completed tasks
  const flat = useMemo(
    () => groups.filter((g) => g.key !== "done").flatMap((g) => g.todos),
    [groups],
  );

  const completedCount = useMemo(
    () => todos.filter((t) => !!t.completedAt).length,
    [todos],
  );

  const overdueCount = useMemo(
    () => groupTodos(todos).find((g) => g.key === "overdue")?.todos.length ?? 0,
    [todos],
  );

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, flat.length - 1)));
  }, [flat.length]);

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

  const handleTagClick = (tag: string) => {
    setActiveTag((t) => (t === tag ? null : tag));
  };

  const handleCreated = (id: string) => {
    // Clear any active tag filter so the new task is immediately visible
    if (activeTag) setActiveTag(null);
    window.clearTimeout(lastAddedTimer.current);
    setLastAddedId(id);
    lastAddedTimer.current = window.setTimeout(() => setLastAddedId(null), 1500);
  };

  const handleDeleted = (id: string) => {
    showToast("Task deleted", () => updateTodo(id, { deletedAt: undefined }));
  };

  const open = todos.filter((t) => !t.completedAt).length;
  // When a tag filter is active, show matching count instead of total
  const displayCount = activeTag
    ? filteredTodos.filter((t) => !t.completedAt).length
    : open;
  const countLabel = activeTag ? "matching" : "open";

  // Sync status pill
  const syncDot = !online
    ? "bg-amber-400"
    : lastSyncedAt
      ? "bg-emerald-400"
      : "bg-[var(--color-text-faint)]";
  const syncLabel = !online ? "offline" : syncing ? "syncing…" : lastSyncedAt ? "synced" : "local";

  if (session.status === "loading") {
    return (
      <div className="grid min-h-full place-items-center">
        <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
      </div>
    );
  }
  if (session.status === "out") return <SignInScreen onAuthed={session.refresh} />;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-3">
          <div className="brand-mark grid size-9 place-items-center rounded-[11px] text-white">
            <Check className="size-5" strokeWidth={3} />
          </div>
          <div>
            <h1 className="font-display text-[19px] font-bold leading-none tracking-tight">
              Nudge
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-[var(--color-text-faint)]">
              <span className="tabular-nums">{displayCount}</span> {countLabel}
              {overdueCount > 0 && (
                <>
                  <span className="text-[var(--color-text-faint)]/50">·</span>
                  <span className="font-semibold text-[var(--color-danger)]">
                    {overdueCount} overdue
                  </span>
                </>
              )}
              <span className="text-[var(--color-text-faint)]/50">·</span>
              <span className="inline-flex items-center gap-1">
                <span className={`size-1.5 rounded-full ${syncDot}`} />
                {syncLabel}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={syncNow}
            title="Sync now"
            disabled={syncing}
            className="rounded-lg p-2 text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-40"
          >
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="rounded-lg p-2 text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <AccountMenu session={session} />
        </div>
      </header>

      {/* Desktop quick-add */}
      <div className="hidden sm:block">
        <QuickAdd ref={quickAddRef} onCreated={handleCreated} />
      </div>

      {/* Active tag filter chip */}
      {activeTag && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
          >
            {activeTag}
            <X className="size-3" />
          </button>
          <button
            onClick={() => setActiveTag(null)}
            className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] transition-colors"
          >
            clear
          </button>
        </div>
      )}

      <main className="flex-1 py-4">
        {flat.length === 0 && groups.length === 0 ? (
          activeTag ? (
            <div className="grid place-items-center py-24 text-center">
              <p className="text-sm text-[var(--color-text-faint)]">
                No tasks tagged "{activeTag}".
              </p>
              <button
                onClick={() => setActiveTag(null)}
                className="mt-2 text-xs text-[var(--color-accent)] hover:opacity-80"
              >
                Clear filter
              </button>
            </div>
          ) : (
            <Empty />
          )
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                {/* Hide section header when there's only one visible group — it's redundant */}
                {groups.length > 1 && (
                  <h2 className="mb-1.5 flex items-center gap-2 px-3 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-dim)]">
                    {group.label}
                    <span className="font-mono text-[10px] font-normal tabular-nums text-[var(--color-text-faint)]">
                      {group.todos.length}
                    </span>
                    <span className="h-px flex-1 bg-[var(--color-border)]" />
                  </h2>
                )}
                <div>
                  {group.todos.map((todo) => {
                    const index = flat.indexOf(todo);
                    return (
                      <TodoRow
                        key={todo.id}
                        todo={todo}
                        selected={index === selected}
                        flash={todo.id === lastAddedId}
                        onSelect={() => setSelected(index)}
                        onOpen={() => setEditing(todo)}
                        onTagClick={handleTagClick}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Completed toggle — always visible when there are completed items, even in empty-state */}
        {completedCount > 0 && !activeTag && (
          <button
            onClick={() => setShowCompleted((s) => !s)}
            className="mt-4 w-full py-1.5 text-center text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] transition-colors"
          >
            {showCompleted ? "Hide completed" : `Show ${completedCount} completed`}
          </button>
        )}

        {/* Mobile usage hint — shown below the list on first use */}
        {flat.length > 0 && (
          <p className="mt-4 text-center text-[11px] text-[var(--color-text-faint)] sm:hidden">
            Tap a task to edit · tap ○ to complete
          </p>
        )}
      </main>

      {/* Mobile quick-add (sticky bottom) */}
      <div className="sticky bottom-0 -mx-4 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 safe-bottom sm:hidden">
        <QuickAdd ref={quickAddRef} onCreated={handleCreated} />
      </div>

      {/* Footer keyboard hints (desktop) */}
      <footer className="hidden items-center gap-3 py-3 text-[11px] text-[var(--color-text-faint)] sm:flex">
        <span className="flex items-center gap-1">
          <Kbd><CommandIcon className="inline size-2.5" />K</Kbd> command
        </span>
        <span><Kbd>↑↓</Kbd> move</span>
        <span><Kbd>⏎</Kbd> open</span>
        <span><Kbd>X</Kbd> complete</span>
        <span><Kbd>N</Kbd> new</span>
      </footer>

      {editing && (
        <EditDialog
          todo={editing}
          onClose={() => setEditing(null)}
          onDeleted={handleDeleted}
        />
      )}

      <CommandPalette
        todos={todos}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNew={() => quickAddRef.current?.focus()}
        onOpen={(t) => setEditing(t)}
      />

      {/* Undo toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-2.5 shadow-xl text-sm sm:bottom-6 animate-sheet">
          <span className="text-[var(--color-text)]">{toast.msg}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                window.clearTimeout(toastTimer.current);
                setToast(null);
              }}
              className="font-medium text-[var(--color-accent)] hover:opacity-75 transition-opacity"
            >
              Undo
            </button>
          )}
          <button
            onClick={() => { window.clearTimeout(toastTimer.current); setToast(null); }}
            className="text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
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
