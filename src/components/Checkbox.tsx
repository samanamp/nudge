import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  checked: boolean;
  onToggle: () => void;
  className?: string;
}

export function Checkbox({ checked, onToggle, className }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        // Visual ring kept at 18 px; touch target expanded to 44 px via pseudo-element
        "relative grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors",
        "after:absolute after:inset-[-13px] after:content-['']",
        checked
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
          : "border-[var(--color-text-faint)] hover:border-[var(--color-text-dim)]",
        className,
      )}
    >
      <Check
        className={cn(
          "size-3 transition-all duration-150",
          checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
        strokeWidth={3}
      />
    </button>
  );
}
