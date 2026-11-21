"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, Cell, Line, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Summary } from "@/lib/data";
import { colorVar } from "@/lib/theme";
import { num, short, signed } from "@/lib/format";

const axis = { fontSize: 11, fill: colorVar("muted") };

function Tip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lift">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
          <span className="tnum font-medium">{signed(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Where on the horizon the forecast moved: increases up, decreases down, net as a line. Click a month to filter. */
export function MovementByPeriod({ s, onPeriod, active }: { s: Summary; onPeriod: (p: string) => void; active?: string | null }) {
  const data = s.by_period.map((p) => ({ ...p, up: Number(p.up), down: Number(p.down), net: Number(p.net) }));
  return (
    <div className="h-[230px]">
      <ResponsiveContainer>
        <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
          onClick={(e: { activeLabel?: string | number } | null) => e?.activeLabel != null && onPeriod(String(e.activeLabel))}>
          <CartesianGrid vertical={false} stroke={colorVar("line")} />
          <XAxis dataKey="period" tick={axis} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={46}
            tickFormatter={(v: string) => v.replace(/^20(\d\d) M/, "$1·")} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => short(v)} width={52} />
          <Tooltip content={<Tip />} cursor={{ fill: colorVar("amber", 0.08) }} />
          <ReferenceLine y={0} stroke={colorVar("line-strong")} />
          <Bar dataKey="up" name="Increases" stackId="a" radius={[3, 3, 0, 0]} maxBarSize={22} style={{ cursor: "pointer" }}>
            {data.map((d) => <Cell key={d.period} fill={colorVar("up", active && active !== d.period ? 0.3 : 0.9)} />)}
          </Bar>
          <Bar dataKey="down" name="Decreases" stackId="a" radius={[0, 0, 3, 3]} maxBarSize={22} style={{ cursor: "pointer" }}>
            {data.map((d) => <Cell key={d.period} fill={colorVar("down", active && active !== d.period ? 0.3 : 0.85)} />)}
          </Bar>
          <Line dataKey="net" name="Net" stroke={colorVar("amber")} strokeWidth={2} dot={{ r: 2.5, fill: colorVar("amber") }} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Previous total → increases → decreases → new → removed → current total. */
export function Waterfall({ s }: { s: Summary }) {
  const [hover, setHover] = useState<number | null>(null);
  const prev = Number(s.prev_total), wf = s.wf;
  const steps = [
    { label: "Previous", value: prev, kind: "total" as const },
    { label: "Increases", value: Number(wf.increases), kind: "up" as const },
    { label: "Decreases", value: Number(wf.decreases), kind: "down" as const },
    { label: "New parts", value: Number(wf.added), kind: "new" as const },
    { label: "Removed", value: Number(wf.dropped), kind: "removed" as const },
    { label: "Current", value: Number(s.total), kind: "total" as const },
  ];
  // bars float: each change starts where the running total left off
  let run = 0;
  const bars = steps.map((st) => {
    if (st.kind === "total") { run = st.value; return { ...st, from: 0, to: st.value }; }
    const from = run; run += st.value;
    return { ...st, from, to: run };
  });
  const lo = Math.min(...bars.filter((b) => b.kind !== "total").map((b) => Math.min(b.from, b.to)), prev, Number(s.total));
  const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to)));
  // zoom into the band where things moved (totals are tall; changes are small)
  const pad = (hi - lo) * 0.35 || hi * 0.02;
  const min = Math.max(0, lo - pad), max = hi + pad * 0.4;
  const H = 190, W = 100 / bars.length;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const color = { total: "navy", up: "up", down: "down", new: "new", removed: "removed" } as const;
  return (
    <div className="relative h-[230px]">
      <svg viewBox={`0 0 100 ${H + 34}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        {bars.map((b, i) => {
          const top = y(Math.max(b.from, b.to)), bottom = b.kind === "total" ? H : y(Math.min(b.from, b.to));
          const x = i * W + W * 0.2, w = W * 0.6;
          return (
            <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {i > 0 && <line x1={(i - 1) * W + W * 0.8} x2={x} y1={y(bars[i - 1].to)} y2={y(bars[i - 1].to)} stroke={colorVar("line-strong")} strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />}
              <motion.rect x={x} width={w} rx={0.8} fill={colorVar(color[b.kind], hover === null || hover === i ? 0.9 : 0.35)}
                initial={{ y: H, height: 0 }} animate={{ y: top, height: Math.max(1.2, bottom - top) }} transition={{ delay: i * 0.08, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }} />
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid" style={{ gridTemplateColumns: `repeat(${bars.length}, 1fr)` }}>
        {bars.map((b, i) => (
          <div key={b.label} className="text-center leading-tight">
            <div className={`tnum text-[12px] font-semibold ${b.kind === "total" ? "text-ink" : `text-${color[b.kind]}`}`}>
              {b.kind === "total" ? short(b.value) : signed(b.value, true)}
            </div>
            <div className={`text-[10.5px] ${hover === i ? "text-ink" : "text-muted"}`}>{b.label}</div>
          </div>
        ))}
      </div>
      {hover !== null && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-md bg-chrome px-2 py-1 text-[11px] text-on-chrome shadow-lift">
          {bars[hover].label}: <span className="tnum font-semibold">{bars[hover].kind === "total" ? num(bars[hover].value) : signed(bars[hover].value)}</span>
        </div>
      )}
    </div>
  );
}

/** One part: how the forecast for each month has moved, snapshot by snapshot. */
export function PartEvolution({ snapshots, focus }: {
  snapshots: { label: string; lines: { period: string; qty: number }[] }[]; focus?: string | null;
}) {
  const periods = snapshots.at(-1)?.lines.map((l) => l.period) ?? [];
  const data = periods.map((p) => {
    const row: Record<string, number | string> = { period: p };
    snapshots.forEach((s, i) => { row[`s${i}`] = Number(s.lines.find((l) => l.period === p)?.qty ?? 0); });
    return row;
  });
  const n = snapshots.length;
  return (
    <div className="h-[240px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={1} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={colorVar("line")} />
          <XAxis dataKey="period" tick={axis} tickLine={false} axisLine={false} interval={0} angle={-40} textAnchor="end" height={46}
            tickFormatter={(v: string) => v.replace(/^20(\d\d) M/, "$1·")} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => short(v)} width={52} />
          <Tooltip cursor={{ fill: colorVar("amber", 0.08) }} formatter={(v) => num(Number(v))}
            contentStyle={{ background: colorVar("panel"), border: `1px solid ${colorVar("line")}`, borderRadius: 8, fontSize: 12 }} />
          {snapshots.map((s, i) => (
            <Bar key={i} dataKey={`s${i}`} name={s.label} radius={[2, 2, 0, 0]} maxBarSize={14}
              fill={i === n - 1 ? colorVar("series-curr") : i === n - 2 ? colorVar("teal", 0.75) : colorVar("series-prev", 0.4 + (0.4 * i) / Math.max(1, n))}>
              {data.map((d) => <Cell key={String(d.period)} fillOpacity={focus && focus !== d.period ? 0.35 : 1} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
