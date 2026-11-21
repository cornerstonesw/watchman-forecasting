// Watchman mark: a lookout tower over a rising trend line (navy + amber).
// Colors come from the theme, so the tile stays navy and the line amber in both themes.
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="Watchman">
      <defs>
        <linearGradient id="wm-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1C4B78" />
          <stop offset="1" stopColor="#0E2742" />
        </linearGradient>
        <radialGradient id="wm-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F5C46A" stopOpacity="0.9" />
          <stop offset="1" stopColor="#F5C46A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#wm-tile)" />
      {/* beacon glow */}
      <circle cx="16" cy="10.3" r="5" fill="url(#wm-glow)" />
      {/* tower */}
      <g fill="none" stroke="#E7EEF6" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round">
        <path d="M10.8 8.2 16 4.6l5.2 3.6" />
        <rect x="12.2" y="8.2" width="7.6" height="4.4" rx="0.6" />
        <path d="M10.4 12.6h11.2" strokeWidth="1.6" />
        <path d="M12.8 12.8 10.6 25.5M19.2 12.8l2.2 12.7M12.2 17.5l7.6 3.4M19.8 17.5l-7.6 3.4" />
      </g>
      <rect x="14.4" y="9.4" width="3.2" height="2.1" rx="0.4" fill="#F5C46A" />
      {/* rising trend line */}
      <path d="M3.5 27.2 9.6 24.4l5.2 1.5 6.6-5.2 6.8-4.3" fill="none" stroke="#D69A2D" strokeWidth="2.1"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="m24.4 16.3 3.8.1-1.2 3.6" fill="none" stroke="#D69A2D" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoLockup({ tagline = true, light = false }: { tagline?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={34} />
      <div className="leading-tight">
        <div className={`text-[15px] font-semibold tracking-tight ${light ? "text-on-chrome" : "text-ink"}`}>
          Watchman <span className="font-normal opacity-80">Forecasting</span>
        </div>
        {tagline && <div className="text-[11px] font-medium tracking-wide text-amber">See it coming.</div>}
      </div>
    </div>
  );
}
