import { SignInForm } from "./SignInForm";
import { LogoGlyph } from "./Logo";

/** Full-page sign-in gate shown when signed out. */
export function SignInScreen({ onAuthed }: { onAuthed?: () => void }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-5">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[22%] size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-accent)]/15 blur-[100px]"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="brand-mark mb-4 grid size-14 place-items-center rounded-2xl text-white">
            <LogoGlyph className="size-8" animated />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Nudge</h1>
          <p className="mt-1.5 text-sm text-[var(--color-text-dim)]">
            It nudges until it's done.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
          <p className="mb-4 text-center text-xs text-[var(--color-text-dim)]">
            Sign in with your password, or choose "Email a link instead" for a
            one-click login.
          </p>
          <SignInForm onAuthed={onAuthed} />
        </div>

        <p className="mt-6 text-center text-[11px] text-[var(--color-text-faint)]">
          Your tasks sync securely and are available offline once signed in.
        </p>
      </div>
    </div>
  );
}
