import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, User, X, Check, Calendar } from "lucide-react";
import type { Session } from "@/lib/session";
import { requestAndSubscribePush } from "@/lib/notify";

export function AccountMenu({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Open the menu when returning from Google OAuth
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const gcal = sp.get("gcal");
    if (gcal) {
      window.history.replaceState({}, "", window.location.pathname);
      if (gcal === "connected") setOpen(true);
    }
  }, []);

  // Close on outside click (desktop dropdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={session.email ?? "Account"}
        className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
      >
        <User className="size-4" />
        <span className="size-1.5 rounded-full bg-emerald-400" title="Signed in" />
      </button>

      {open && (
        <>
          {/* Mobile: full-screen sheet */}
          <div
            className="sm:hidden animate-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="animate-sheet w-full max-w-sm rounded-t-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 shadow-2xl"
            >
              <MenuHeader onClose={() => setOpen(false)} />
              <SignedIn session={session} onClose={() => setOpen(false)} />
            </div>
          </div>

          {/* Desktop: dropdown */}
          <div className="hidden sm:block animate-sheet absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 shadow-2xl">
            <MenuHeader onClose={() => setOpen(false)} />
            <SignedIn session={session} onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-dim)]">
        Account
      </span>
      <button
        onClick={onClose}
        className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)]"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function SignedIn({ session, onClose }: { session: Session; onClose: () => void }) {
  const [perm, setPerm] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [gcal, setGcal] = useState<"loading" | "connected" | "disconnected">("loading");

  useEffect(() => {
    fetch("/api/auth/google/status", { credentials: "include" })
      .then((r) => r.json() as Promise<{ connected: boolean }>)
      .then((d) => setGcal(d.connected ? "connected" : "disconnected"))
      .catch(() => setGcal("disconnected"));
  }, []);

  const disconnectGcal = async () => {
    await fetch("/api/auth/google/disconnect", { method: "POST", credentials: "include" });
    setGcal("disconnected");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-2.5">
        <div className="grid size-8 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
          {session.email?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm">{session.email}</p>
          <p className="text-[11px] text-emerald-400">Signed in</p>
        </div>
      </div>

      <button
        onClick={async () => setPerm(await requestAndSubscribePush())}
        disabled={perm === "granted"}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-60"
      >
        {perm === "granted" ? (
          <><Check className="size-4 text-emerald-400" /> Notifications enabled</>
        ) : (
          <><Bell className="size-4" /> Enable notifications</>
        )}
      </button>

      {gcal !== "loading" && (
        gcal === "connected" ? (
          <button
            onClick={disconnectGcal}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-danger)]"
          >
            <Check className="size-4 text-emerald-400" />
            Google Calendar connected
            <span className="ml-auto text-[11px] opacity-60">Disconnect</span>
          </button>
        ) : (
          <a
            href="/api/auth/google"
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
          >
            <Calendar className="size-4" /> Connect Google Calendar
          </a>
        )
      )}

      <button
        onClick={async () => { await session.logout(); onClose(); }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}
