import { useState } from "react";
import { Mail } from "lucide-react";
import { api } from "@/lib/api";

type Mode = "login" | "signup";

/**
 * Email + password sign-in / account creation, with a magic-link fallback.
 * Calls `onAuthed` after a successful password auth so the session refreshes.
 */
export function SignInForm({ onAuthed }: { onAuthed?: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await api.login(email.trim(), password);
      else await api.signup(email.trim(), password);
      onAuthed?.();
    } catch (e) {
      const status = e instanceof Error ? e.message : "";
      setError(
        mode === "login"
          ? "Invalid email or password."
          : status === "409"
            ? "Account exists, or password is under 8 characters."
            : "Couldn't create account.",
      );
    } finally {
      setBusy(false);
    }
  };

  const sendMagicLink = async () => {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setBusy(true);
    await api.requestLink(email.trim()).catch(() => {});
    setBusy(false);
    setMagicSent(true);
  };

  if (magicSent) {
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
          onClick={() => setMagicSent(false)}
          className="mt-3 text-xs text-[var(--color-text-dim)] underline-offset-2 hover:underline"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="email"
        value={email}
        autoFocus
        autoComplete="email"
        placeholder="you@example.com"
        onChange={(e) => setEmail(e.target.value)}
        className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
      />
      <input
        type="password"
        value={password}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        placeholder={mode === "login" ? "Password" : "Password (min 8 chars)"}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
      />

      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}

      <button
        onClick={submit}
        disabled={busy || !email.trim() || !password}
        className="h-11 w-full rounded-lg bg-[var(--color-accent)] text-sm font-medium text-[var(--color-accent-fg)] shadow-[0_2px_12px_-2px_var(--color-accent-soft)] transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </button>

      <div className="flex items-center justify-between text-xs text-[var(--color-text-dim)]">
        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
          className="underline-offset-2 hover:underline"
        >
          {mode === "login" ? "Create an account" : "Have an account? Sign in"}
        </button>
        <button
          onClick={sendMagicLink}
          className="underline-offset-2 hover:underline"
        >
          Email a link instead
        </button>
      </div>
    </div>
  );
}
