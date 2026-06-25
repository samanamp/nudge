import { useState } from "react";
import { Mail } from "lucide-react";
import { api } from "@/lib/api";

/** Passwordless email → magic-link form with a "check your email" success state. */
export function SignInForm({ onSent }: { onSent?: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    await api.requestLink(email.trim()).catch(() => {});
    setBusy(false);
    setSent(true);
    onSent?.();
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
        <button
          onClick={() => setSent(false)}
          className="mt-3 text-xs text-[var(--color-text-dim)] underline-offset-2 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="email"
        value={email}
        autoFocus
        placeholder="you@example.com"
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="mb-3 h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
      />
      <button
        onClick={submit}
        disabled={busy || !email.trim()}
        className="h-11 w-full rounded-lg bg-[var(--color-accent)] text-sm font-medium text-[var(--color-accent-fg)] shadow-[0_2px_12px_-2px_var(--color-accent-soft)] transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
    </div>
  );
}
