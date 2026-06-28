import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { CheckCircle2, Palette, Plus } from "lucide-react";
import type { Todo } from "@/lib/types";
import { formatDue } from "@/lib/dates";

interface Props {
  todos: Todo[];
  onNew: () => void;
  onOpen: (todo: Todo) => void;
  onToggleTheme: () => void;
}

/** ⌘K command palette: quick actions + fuzzy jump to any task. */
export function CommandPalette({
  todos,
  onNew,
  onOpen,
  onToggleTheme,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="animate-overlay fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl"
      >
        <Command.Input
          autoFocus
          placeholder="Type a command or search tasks…"
          className="h-12 w-full border-b border-[var(--color-border)] bg-transparent px-4 text-sm outline-none placeholder:text-[var(--color-text-faint)]"
        />
        <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-xs text-[var(--color-text-faint)]">
            No results.
          </Command.Empty>

          <Command.Group
            heading="Actions"
            className="px-1 text-[10px] uppercase tracking-wide text-[var(--color-text-faint)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
          >
            <Item onSelect={() => run(onNew)} icon={<Plus className="size-4" />}>
              New task
            </Item>
            <Item onSelect={() => run(onToggleTheme)} icon={<Palette className="size-4" />}>
              Next theme
            </Item>
          </Command.Group>

          <Command.Group
            heading="Tasks"
            className="px-1 text-[10px] uppercase tracking-wide text-[var(--color-text-faint)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
          >
            {todos
              .filter((t) => !t.completedAt && !t.deletedAt)
              .slice(0, 50)
              .map((t) => (
                <Item
                  key={t.id}
                  value={`task-${t.id}-${t.title}`}
                  onSelect={() => run(() => onOpen(t))}
                  icon={<CheckCircle2 className="size-4" />}
                  meta={t.dueAt !== undefined ? formatDue(t.dueAt) : undefined}
                >
                  {t.title}
                </Item>
              ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}

function Item({
  children,
  icon,
  meta,
  value,
  onSelect,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  meta?: string;
  value?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-[var(--color-text)] data-[selected=true]:bg-[var(--color-surface-2)]"
    >
      <span className="text-[var(--color-text-dim)]">{icon}</span>
      <span className="flex-1 truncate normal-case tracking-normal">
        {children}
      </span>
      {meta && (
        <span className="font-mono text-[11px] tabular-nums text-[var(--color-text-faint)]">
          {meta}
        </span>
      )}
    </Command.Item>
  );
}
