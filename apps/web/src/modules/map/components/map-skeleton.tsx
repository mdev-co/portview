/**
 * Layout-shift-free placeholder rendered by the Suspense boundary in
 * the index route while the lazy `MapView` chunk (MapLibre + map
 * module) is in-flight. Matches the size of the real MapView slot so
 * CLS stays at zero.
 *
 * Visual: muted theme background with a faint lat/lon grid plus the
 * project's radar mark centered with a subtle pulse. The grid uses
 * two CSS linear gradients (no SVG element, no extra asset request)
 * so the rendered skeleton stays inside the initial app chunk.
 *
 * The radar mark is the same path geometry as `public/favicon.svg`,
 * inlined here so the lazy boundary does not have to wait for a
 * second network round-trip just to show the placeholder.
 */
export function MapSkeleton() {
  return (
    <div
      className="bg-background relative h-full w-full overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading radar"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          color: 'var(--muted-foreground)',
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-12 animate-pulse text-emerald-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
          <path d="M4 6h.01" />
          <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
          <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
          <path d="M12 18h.01" />
          <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <path d="m13.41 10.59 5.66-5.66" />
        </svg>
        <span className="text-muted-foreground text-[11px] font-mono tracking-[0.2em] uppercase">
          locking signal
        </span>
      </div>
    </div>
  );
}
