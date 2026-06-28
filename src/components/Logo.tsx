/**
 * Nudge brand glyph — a "pulse": a dot sending a ripple forward, evoking a
 * gentle nudge / ping. Rendered in white inside the gradient `.brand-mark` box.
 * `currentColor`, so it inherits text color and scales with size-* classes.
 */
export function LogoGlyph({
  className,
  animated = false,
}: {
  className?: string;
  /** Gently "ping" the ripples outward — used on the sign-in screen. */
  animated?: boolean;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="8" cy="12" r="2.5" fill="currentColor" />
      <path
        d="M11.4 8.2a5 5 0 0 1 0 7.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={animated ? "logo-ping logo-ping-1" : undefined}
      />
      <path
        d="M13.7 5.7a8.5 8.5 0 0 1 0 12.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={animated ? "logo-ping logo-ping-2" : undefined}
      />
    </svg>
  );
}
