import { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";

// The frame every sign-in screen sits in: the watchtower "horizon" on the
// left (hidden on phones), the form on the right.
export default function AuthShell({ title, subtitle, children, footer }: {
  title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="horizon relative hidden overflow-hidden lg:block">
        <div className="horizon-grid absolute inset-0" />
        <Radar />
        <div className="relative flex h-full flex-col justify-between p-12 text-on-chrome">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <div className="text-lg font-semibold tracking-tight">Watchman <span className="font-normal opacity-80">Forecasting</span></div>
          </div>
          <div className="max-w-md">
            <div className="text-[44px] font-semibold leading-[1.05] tracking-tight">See it coming.</div>
            <p className="mt-4 text-[15px] leading-relaxed text-on-chrome-dim">
              Every forecast your customer sends becomes a snapshot. Watchman shows what moved, what&rsquo;s trending,
              and what&rsquo;s new — and answers questions in plain English.
            </p>
          </div>
          <div className="text-xs text-on-chrome-dim">Cornerstone Software · Somers, CT</div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center bg-page px-5 py-10">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <LogoMark size={36} />
          <div className="leading-tight">
            <div className="font-semibold">Watchman Forecasting</div>
            <div className="text-xs font-medium text-amber">See it coming.</div>
          </div>
        </div>
        <div className="card w-full max-w-sm animate-fade-up p-7">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-5 text-xs text-slate">{footer}</div>}
      </div>
    </div>
  );
}

// a slow radar sweep with a few "blips" — the watchman's view of the horizon
function Radar() {
  return (
    <svg className="pointer-events-none absolute -bottom-40 -right-40 h-[620px] w-[620px] opacity-60" viewBox="0 0 200 200" aria-hidden>
      <defs>
        <radialGradient id="rg" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#D69A2D" stopOpacity="0.35" />
          <stop offset="1" stopColor="#D69A2D" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D69A2D" stopOpacity="0" />
          <stop offset="1" stopColor="#D69A2D" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {[30, 55, 80, 98].map((r) => <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#9DB2C8" strokeOpacity="0.18" />)}
      <g className="origin-center animate-sweep" style={{ transformOrigin: "100px 100px" }}>
        <path d="M100 100 L198 100 A98 98 0 0 0 169 31 Z" fill="url(#sw)" />
      </g>
      {[[140, 70], [62, 128], [120, 150], [75, 60]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.2" fill="#F5C46A">
          <animate attributeName="opacity" values="0.2;1;0.2" dur={`${2.4 + i * 0.7}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

export const safeNext = (next: string | null | undefined) =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

export function ErrorBanner({ children }: { children: ReactNode }) {
  return <div role="alert" className="mb-4 rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-sm text-down">{children}</div>;
}
export function NoteBanner({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-lg border border-teal/30 bg-teal-soft px-3 py-2 text-sm text-ink">{children}</div>;
}
