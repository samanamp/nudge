import { useState } from "react";
import { Bell, LogOut, User, X, Check } from "lucide-react";
import type { Session } from "@/lib/session";
import { requestNotifyPermission } from "@/lib/notify";

/** Signed-in account sheet: identity, notifications, sign out. */
export function AccountMenu({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={session.email ?? "Account"}
        className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
      >
        <User className="size-4" />
        <span className="size-1.5 rounded-full bg-emerald-400" title="Signed in" />
      </button>

      {open && (
        <div
          className="animate-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet w-full max-w-sm rounded-t-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-dim)]">
                Account
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]"
              >
                <X className="size-4" />
              </button>
            </div>
            <SignedIn session={session} />
          </div>
        </div>
      )}
    </>
  );
}

function SignedIn({ session }: { session: Session }) {
  const [perm, setPerm] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-2.5">
        <div className="grid size-8 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
          {session.email?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm">{session.email}</p>
          <p className="text-[11px] text-emerald-400">Synced · reminders on</p>
        </div>
      </div>

      <button
        onClick={async () => setPerm(await requestNotifyPermission())}
        disabled={perm === "granted"}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-60"
      >
        {perm === "granted" ? (
          <>
            <Check className="size-4 text-emerald-400" /> Notifications enabled
          </>
        ) : (
          <>
            <Bell className="size-4" /> Enable notifications
          </>
        )}
      </button>

      <button
        onClick={session.logout}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}
