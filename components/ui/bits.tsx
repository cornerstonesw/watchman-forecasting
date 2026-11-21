"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { Flame, Minus, MoveRight, Plus, Shuffle, TrendingDown, TrendingUp } from "lucide-react";
import type { Trend } from "@/lib/query";
import { cx } from "@/lib/format";

/** Numbers that count up to their value (and glide to a new one). */
export function CountUp({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.textContent = format(value); from.current = value; return; }
    const c = animate(from.current, value, {
      duration: 0.9, ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (v) => { el.textContent = format(v); },
    });
    from.current = value;
    return () => c.stop();
  }, [value, format]);
  return <span ref={ref} className={cx("tnum", className)}>{format(0)}</span>;
}

const TREND_STYLE: Record<Trend | "Baseline", { cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  Increased: { cls: "bg-up-soft text-up", icon: TrendingUp },
  Decreased: { cls: "bg-down-soft text-down", icon: TrendingDown },
  "No Change": { cls: "bg-flat-soft text-flat", icon: MoveRight },
  Shifted: { cls: "bg-shift-soft text-shift", icon: Shuffle },
  New: { cls: "bg-new-soft text-new", icon: Plus },
  Removed: { cls: "bg-removed-soft text-removed", icon: Minus },
  Baseline: { cls: "bg-flat-soft text-flat", icon: MoveRight },
};
export const trendColor = (t: string) =>
  ({ Increased: "up", Decreased: "down", "No Change": "flat", Shifted: "shift", New: "new", Removed: "removed" } as const)[t as Trend] ?? "flat";

export function TrendPill({ trend, compact }: { trend: Trend | string; compact?: boolean }) {
  const s = TREND_STYLE[trend as Trend] ?? TREND_STYLE["No Change"];
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls)}>
      <Icon className="h-3 w-3" />
      {!compact && trend}
    </span>
  );
}

export function Streak({ n }: { n: number }) {
  if (Math.abs(n) < 2) return null;
  return (
    <span title={`${n > 0 ? "Up" : "Down"} ${Math.abs(n)} imports in a row`}
      className={cx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold", n > 0 ? "bg-amber-soft text-amber-ink" : "bg-down-soft text-down")}>
      <Flame className="h-3 w-3" />{Math.abs(n)}×
    </span>
  );
}

/** Previous (grey) vs current (navy) across the horizon. */
export function Sparkline({ prev, curr, w = 120, h = 28 }: { prev: number[]; curr: number[]; w?: number; h?: number }) {
  const all = [...prev, ...curr];
  const max = Math.max(1, ...all);
  const pts = (arr: number[]) =>
    arr.map((v, i) => `${(i / Math.max(1, arr.length - 1)) * (w - 2) + 1},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  const area = `1,${h - 1} ${pts(curr)} ${w - 1},${h - 1}`;
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts(prev)} fill="none" stroke="rgb(var(--c-series-prev))" strokeWidth="1.25" strokeDasharray="2.5 2" />
      <polygon points={area} fill="rgb(var(--c-navy) / 0.08)" />
      <polyline points={pts(curr)} fill="none" stroke="rgb(var(--c-series-curr))" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** A tiny trend line for KPI cards. */
export function MiniTrend({ values, color = "navy" }: { values: number[]; color?: string }) {
  const w = 84, h = 26;
  if (values.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const p = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const d = p.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const [lx, ly] = p[p.length - 1];
  return (
    <svg width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke={`rgb(var(--c-${color}))`} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.6" fill={`rgb(var(--c-${color}))`} />
      <circle cx={lx} cy={ly} r="5" fill={`rgb(var(--c-${color}) / 0.2)`} />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

/** "Copied!"-style transient toast at the bottom of the screen. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 2600);
    return () => window.clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 animate-fade-up rounded-full bg-chrome px-4 py-2 text-sm text-on-chrome shadow-pop">{msg}</div>
  ) : null;
  return { toast: setMsg, toastNode: node };
}
