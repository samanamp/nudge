import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { THEMES, type ThemeId } from "@/lib/useTheme";
import { cn } from "@/lib/cn";

/** Header control to pick a color theme (swatch + name). */
export function ThemeMenu({
  theme,
  setTheme,
}: {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Theme"
        className="rounded-lg p-2 text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
      >
        <Palette className="size-4" />
      </button>

      {open && (
        <div className="animate-sheet absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1.5 shadow-2xl">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)]",
                theme === t.id && "bg-[var(--color-surface-2)]",
              )}
            >
              <span
                className="grid size-6 shrink-0 place-items-center rounded-md ring-1 ring-black/30"
                style={{ background: t.swatch[0] }}
              >
                <span className="size-2.5 rounded-full" style={{ background: t.swatch[1] }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--color-text)]">{t.name}</span>
                <span className="block text-[11px] text-[var(--color-text-faint)]">{t.hint}</span>
              </span>
              {theme === t.id && <Check className="size-3.5 shrink-0 text-[var(--color-accent-text)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
