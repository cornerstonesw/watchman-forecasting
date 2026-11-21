"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Telescope, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useWorkspace } from "@/components/Workspace";
import { PartDetail } from "@/components/PartDrawer";
import { grid, horizonHistory, searchParts, type HorizonHistory } from "@/lib/data";
import type { PartRow } from "@/lib/query";
import { Skeleton, TrendPill } from "@/components/ui/bits";
import { colorVar } from "@/lib/theme";
import { cx, dateLabel, num, short, signed } from "@/lib/format";

export default function ExplorePage() {
  const { dataset, base, curr } = useWorkspace();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: number; part_no: string; descr: string | null }[]>([]);
  const [part, setPart] = useState<number | null>(null);
  const [movers, setMovers] = useState<{ up: PartRow[]; down: PartRow[] } | null>(null);
  const [hh, setHh] = useState<HorizonHistory | null>(null);

  useEffect(() => {
    if (!dataset) return;
    const t = setTimeout(() => searchParts(dataset.id, q, 10).then(setHits).catch(() => setHits([])), 150);
    return () => clearTimeout(t);
  }, [q, dataset]);

  useEffect(() => {
    if (!base || !curr) return;
    Promise.all([
      grid(base.id, curr.id, { filter: { trend: ["Increased"] }, mode: "part", sort: "delta", desc: true }, 8),
      grid(base.id, curr.id, { filter: { trend: ["Decreased"] }, mode: "part", sort: "delta", desc: false }, 8),
    ]).then(([u, d]) => setMovers({ up: u.rows as PartRow[], down: d.rows as PartRow[] })).catch(() => setMovers(null));
  }, [base, curr]);

  useEffect(() => { if (dataset) horizonHistory(dataset.id).then(setHh).catch(() => setHh(null)); }, [dataset]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-5 py-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Telescope className="h-6 w-6 text-teal" /> Part explorer</h1>
          <p className="mt-1 text-sm text-slate">Follow one part — or one forecast month — across every snapshot on file.</p>
        </div>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-11 pl-9" placeholder="Find a part by number or description…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && hits.length > 0 && !part && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
              {hits.map((h) => (
                <button key={h.id} onClick={() => { setPart(h.id); setQ(h.part_no); }} className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-sunken">
                  <span className="font-mono text-sm font-medium text-navy">{h.part_no}</span>
                  <span className="truncate text-xs text-muted">{h.descr}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {part ? (
        <div className="card overflow-hidden">
          <div className="flex justify-end border-b border-line px-3 py-1.5">
            <button className="btn-ghost h-7 text-xs" onClick={() => { setPart(null); setQ(""); }}><X className="h-3.5 w-3.5" /> Close part</button>
          </div>
          <PartDetail partId={part} />
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Movers title={`Biggest increases · ${base ? dateLabel(base.as_of) : ""} → ${curr ? dateLabel(curr.as_of) : ""}`} rows={movers?.up} onPick={setPart} />
            <Movers title="Biggest decreases" rows={movers?.down} onPick={setPart} />
          </div>
          <HorizonEvolution hh={hh} />
        </>
      )}
    </div>
  );
}

function Movers({ title, rows, onPick }: { title: string; rows?: PartRow[]; onPick: (id: number) => void }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => Math.abs(Number(r.delta))));
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
      {!rows ? <Skeleton className="h-64" /> : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.part_id}>
              <button onClick={() => onPick(r.part_id)} className="group grid w-full grid-cols-[160px_1fr_90px] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-sunken">
                <span className="truncate font-mono text-[12.5px] font-medium text-navy">{r.part_no}</span>
                <span className="relative h-5 overflow-hidden rounded bg-sunken">
                  <span className={cx("absolute inset-y-0 left-0 rounded transition-all group-hover:brightness-110", Number(r.delta) > 0 ? "bg-up/80" : "bg-down/80")}
                    style={{ width: `${(Math.abs(Number(r.delta)) / max) * 100}%` }} />
                  <span className="absolute inset-0 flex items-center px-2 text-[11px] text-ink/80">{r.descr}</span>
                </span>
                <span className={cx("text-right text-sm font-semibold tnum", Number(r.delta) > 0 ? "text-up" : "text-down")}>{signed(r.delta, true)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// How the total for each forecast month has moved across snapshots
function HorizonEvolution({ hh }: { hh: HorizonHistory | null }) {
  const periods = useMemo(() => hh?.at(-1)?.periods.map((p) => p.period).filter((p) => p !== "Past") ?? [], [hh]);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (periods.length && !picked.length) setPicked(periods.slice(0, 4)); }, [periods, picked.length]);
  if (!hh) return <Skeleton className="h-80" />;
  if (hh.length < 2) return null;
  const palette = ["navy", "teal", "amber", "shift", "down", "new", "removed", "up"] as const;
  const data = hh.map((s) => {
    const row: Record<string, number | string> = { date: dateLabel(s.as_of) };
    for (const p of picked) row[p] = Number(s.periods.find((x) => x.period === p)?.qty ?? 0);
    return row;
  });
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">How each forecast month is moving</h2>
          <p className="text-xs text-muted">Total forecast for the selected months, snapshot by snapshot. Pick up to eight.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {periods.map((p) => {
          const i = picked.indexOf(p);
          return (
            <button key={p} onClick={() => setPicked((l) => (l.includes(p) ? l.filter((x) => x !== p) : l.length < 8 ? [...l, p] : l))}
              className={cx("rounded-full border px-2.5 py-0.5 text-xs transition", i >= 0 ? "border-transparent text-white" : "border-line text-slate hover:border-line-strong")}
              style={i >= 0 ? { background: colorVar(palette[i % palette.length]) } : undefined}>{p}</button>
          );
        })}
      </div>
      <div className="mt-3 h-[280px]">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={colorVar("line")} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: colorVar("muted") }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: colorVar("muted") }} tickLine={false} axisLine={false} tickFormatter={(v: number) => short(v)} width={56} />
            <Tooltip formatter={(v) => num(Number(v))} contentStyle={{ background: colorVar("panel"), border: `1px solid ${colorVar("line")}`, borderRadius: 8, fontSize: 12 }} />
            {picked.map((p, i) => (
              <Line key={p} dataKey={p} stroke={colorVar(palette[i % palette.length])} strokeWidth={2.2} dot={{ r: 3.5 }} activeDot={{ r: 5 }} type="monotone" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted"><TrendPill trend="Increased" compact /> A rising line means that month&rsquo;s forecast keeps growing with each new file.</div>
    </section>
  );
}
