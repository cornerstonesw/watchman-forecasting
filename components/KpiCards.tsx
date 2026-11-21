"use client";

import { motion } from "motion/react";
import { ArrowLeftRight, Boxes, Flame, Minus, Plus, Shuffle, TrendingDown, TrendingUp } from "lucide-react";
import type { Snapshot, Summary } from "@/lib/data";
import type { Query } from "@/lib/query";
import { CountUp, MiniTrend } from "@/components/ui/bits";
import { cx, num, pct, signed } from "@/lib/format";

export type Kpi = {
  id: string; title: string; value: number; fmt: (v: number) => string; sub: string;
  icon: React.ComponentType<{ className?: string }>; tone: string; query: Query | null; spark?: number[];
};

const q = (filter: Query["filter"], extra: Partial<Query> = {}): Query => ({ filter, mode: "part", sort: "impact", desc: true, ...extra });

export function buildKpis(s: Summary, snaps: Snapshot[]): Kpi[] {
  const share = (n: number) => (s.parts_all ? `${Math.round((n / s.parts_all) * 100)}% of parts` : "");
  const netPct = s.prev_total ? (s.net / s.prev_total) * 100 : 0;
  return [
    { id: "parts", title: "Parts tracked", value: s.parts, fmt: num, sub: `${num(s.lines)} part-months`, icon: Boxes, tone: "navy", query: q({}), spark: snaps.map((x) => x.part_count) },
    { id: "net", title: "Net change", value: s.net, fmt: (v) => signed(v, true), sub: `${pct(netPct)} · ${num(s.lines_changed)} lines moved`, icon: ArrowLeftRight, tone: s.net >= 0 ? "up" : "down", query: q({ changed_only: true }), spark: snaps.map((x) => Number(x.total_qty)) },
    { id: "up", title: "Increased", value: s.up, fmt: num, sub: share(s.up), icon: TrendingUp, tone: "up", query: q({ trend: ["Increased"] }, { sort: "delta", desc: true }) },
    { id: "down", title: "Decreased", value: s.down, fmt: num, sub: share(s.down), icon: TrendingDown, tone: "down", query: q({ trend: ["Decreased"] }, { sort: "delta", desc: false }) },
    { id: "tup", title: "Trending up", value: s.trending_up, fmt: num, sub: "up 2+ imports in a row", icon: Flame, tone: "amber", query: q({ trend: ["Increased"], streak_min: 2 }, { sort: "delta", desc: true }) },
    { id: "tdown", title: "Trending down", value: s.trending_down, fmt: num, sub: "down 2+ imports in a row", icon: Flame, tone: "down", query: q({ trend: ["Decreased"], streak_max: -2 }, { sort: "delta", desc: false }) },
    { id: "shift", title: "Shifted", value: s.shifted, fmt: num, sub: "same total, months moved", icon: Shuffle, tone: "shift", query: q({ trend: ["Shifted"] }) },
    { id: "new", title: "New / removed", value: s.new + s.removed, fmt: (v) => num(v), sub: `${num(s.new)} new · ${num(s.removed)} removed`, icon: s.new >= s.removed ? Plus : Minus, tone: "new", query: q({ trend: ["New", "Removed"] }) },
  ];
}

export default function KpiCards({ kpis, active, onPick }: { kpis: Kpi[]; active: string | null; onPick: (k: Kpi) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {kpis.map((k, i) => {
        const Icon = k.icon;
        const on = active === k.id;
        return (
          <motion.button key={k.id} type="button" onClick={() => onPick(k)}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.35 }}
            whileHover={{ y: -2 }}
            aria-pressed={on}
            className={cx("card group relative overflow-hidden p-3.5 text-left transition-shadow hover:shadow-lift",
              on && "ring-2 ring-amber shadow-glow")}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-[12px] font-medium text-slate">{k.title}</div>
              <span className={`grid h-7 w-7 place-items-center rounded-lg bg-${k.tone}/10 text-${k.tone}`}><Icon className="h-4 w-4" /></span>
            </div>
            <div className="mt-1.5 flex items-end justify-between gap-1">
              <CountUp value={k.value} format={k.fmt} className={cx("text-[22px] font-semibold leading-none tracking-tight", k.id === "net" && `text-${k.tone}`)} />
              {k.spark && k.spark.length > 1 && <MiniTrend values={k.spark} color={k.tone} />}
            </div>
            <div className="mt-1.5 truncate text-[11px] text-muted">{k.sub}</div>
            <span className={cx("absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 transition-transform group-hover:scale-x-100", `bg-${k.tone}`, on && "scale-x-100")} />
          </motion.button>
        );
      })}
    </div>
  );
}
