import { forwardRef, useState } from "react";
import { Plus } from "lucide-react";
import { createTodo } from "@/lib/db";
import { cn } from "@/lib/cn";

interface Props {
  className?: string;
  autoFocus?: boolean;
  onCreated?: (id: string) => void;
}

/** Title-only fast capture. Deeper fields live in the edit sheet. */
export const QuickAdd = forwardRef<HTMLInputElement, Props>(
  ({ className, autoFocus, onCreated }, ref) => {
    const [value, setValue] = useState("");

    const submit = async () => {
      const title = value.trim();
      if (!title) return;
      setValue("");
      const id = await createTodo({ title });
      onCreated?.(id);
    };

    return (
      <div
        className={cn(
          "group flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 transition-all",
          "focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]",
          className,
        )}
      >
        <Plus className="size-4 shrink-0 text-[var(--color-text-faint)] transition-colors group-focus-within:text-[var(--color-accent)]" />
        <input
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          placeholder="Add a task…"
          className="h-11 flex-1 bg-transparent text-[13.5px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
      </div>
    );
  },
);
QuickAdd.displayName = "QuickAdd";
