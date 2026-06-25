import { useState } from "react";
import { Bell, LogOut, Mail, User, X, Check } from "lucide-react";
import type { Session } from "@/lib/session";
import { api } from "@/lib/api";
import { requestNotifyPermission } from "@/lib/notify";
import { cn } from "@/lib/cn";

export function AccountMenu({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const signedIn = session.status === "in";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={signedIn ? (session.email ?? "Account") : "Sign in"}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-2 text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
          signedIn && "text-[var(--color-text)]",
        )}
      >
        <User className="size-4" />
        {signedIn && (
          <span className="size-1.5 rounded-full bg-emerald-400" title="Signed in" />
        )}
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

            {signedIn ? (
              <SignedIn session={session} />
            ) : (
              <SignIn onDone={session.refresh} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    await api.requestLink(email.trim()).catch(() => {});
    setBusy(false);
    setSent(true);
    onDone();
  };

  if (sent) {
    return (
      <div className="py-2 text-center">
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-[var(--color-surface-2)]">
          <Mail className="size-5 text-[var(--color-accent)]" />
        </div>
        <p className="text-sm font-medium">Check your email</p>
        <p className="mt-1 text-xs text-[var(--color-text-faint)]">
          We sent a sign-in link to {email}. It expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-[var(--color-text-dim)]">
        Sign in to sync and get email reminders. No password — we email you a link.
      </p>
      <input
        type="email"
        value={email}
        autoFocus
        placeholder="you@example.com"
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="mb-3 h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <button
        onClick={submit}
        disabled={busy || !email.trim()}
        className="h-10 w-full rounded-lg bg-[var(--color-accent)] text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email me a link"}
      </button>
    </div>
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
