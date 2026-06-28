/**
 * Nudge brand glyph — a bold lowercase "n" with a notification/"ping" dot. The
 * dot is the nudge; the letter makes it an ownable monogram. `currentColor`, so
 * it inherits text color (white inside the gradient `.brand-mark`) and scales
 * with size-* classes. When `animated`, the dot emits a gentle ping ripple.
 */
export function LogoGlyph({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M6.8 17.6V12.4" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M6.8 12.4a3.6 3.6 0 0 1 7.2 0v5.2" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      {animated && (
        <circle cx="17.2" cy="7" r="3.6" stroke="currentColor" strokeWidth="1.2" className="logo-ping" />
      )}
      <circle cx="17.2" cy="7" r="2.1" fill="currentColor" />
    </svg>
  );
}
