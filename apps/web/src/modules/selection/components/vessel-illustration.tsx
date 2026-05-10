/**
 * Generic vessel silhouette in a sketch / line-art style. Used as a
 * placeholder above the live + static field grid in the sidebar
 * details panel; we do not have per-vessel photography (would require
 * a third-party API or hand-curated DB) so a single neutral
 * illustration carries the visual weight that VesselFinder gets from
 * real photos. Drawn entirely with `currentColor` so the artwork
 * inherits the surrounding text colour and adapts to light / dark
 * theme without per-mode swaps.
 */
export function VesselIllustration({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 400 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Generic vessel illustration"
    >
      <defs>
        <linearGradient id="vessel-illustration-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      <rect x="0" y="160" width="400" height="40" fill="url(#vessel-illustration-water)" />

      <path
        d="M 0 165 Q 40 162 80 165 T 160 165 T 240 165 T 320 165 T 400 165"
        stroke="currentColor"
        strokeWidth="0.8"
        fill="none"
        opacity="0.35"
      />
      <path
        d="M 0 172 Q 50 169 100 172 T 200 172 T 300 172 T 400 172"
        stroke="currentColor"
        strokeWidth="0.5"
        fill="none"
        opacity="0.25"
      />

      <path
        d="M 50 130 L 70 100 L 215 100 L 215 130 L 360 130 L 340 160 L 60 160 Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <line
        x1="80"
        y1="138"
        x2="320"
        y2="138"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.45"
      />
      <line
        x1="100"
        y1="148"
        x2="300"
        y2="148"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.45"
      />

      <rect
        x="225"
        y="78"
        width="80"
        height="52"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1="232"
        y1="92"
        x2="298"
        y2="92"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.55"
      />
      <line
        x1="232"
        y1="102"
        x2="298"
        y2="102"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.4"
      />

      <rect
        x="248"
        y="50"
        width="22"
        height="30"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line x1="248" y1="60" x2="270" y2="60" stroke="currentColor" strokeWidth="2.2" />

      <line x1="280" y1="78" x2="280" y2="34" stroke="currentColor" strokeWidth="1.4" />
      <line x1="272" y1="42" x2="288" y2="42" stroke="currentColor" strokeWidth="1" />
      <circle cx="280" cy="34" r="2.5" fill="currentColor" opacity="0.7" />

      <g opacity="0.85">
        <rect
          x="120"
          y="112"
          width="22"
          height="18"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="0.8"
        />
        <rect
          x="146"
          y="112"
          width="22"
          height="18"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="0.8"
        />
        <rect
          x="172"
          y="112"
          width="22"
          height="18"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="0.8"
        />
      </g>

      <line
        x1="120"
        y1="100"
        x2="200"
        y2="100"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.35"
      />
    </svg>
  );
}
