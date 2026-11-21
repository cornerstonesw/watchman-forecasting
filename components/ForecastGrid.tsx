"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Search, X } from "lucide-react";
import { grid } from "@/lib/data";
import { TRENDS, cleanFilter, filterChips, withoutKey, type GridResult, type LineRow, type PartRow, type Query, type SortKey, type Trend } from "@/lib/query";
import { writeXlsx } from "@/lib/xlsx";
import { Skeleton, Sparkline, Streak, TrendPill } from "@/components/ui/bits";
import { cx, num, pct, signed } from "@/lib/format";

const PAGE = 50;

type Col = { key: SortKey; label: string; right?: boolean; w?: string };
const PART_COLS: Col[] = [
  { key: "part_no", label: "Part", w: "w-[200px]" },
  { key: "descr", label: "Description" },
  { key: "prev_qty", label: "Previous", right: true },
  { key: "qty", label: "Current", right: true },
  { key: "delta", label: "Change", right: true, w: "w-[170px]" },
  { key: "pct", label: "%", right: true },
  { key: "trend", label: "Trend" },
];
const LINE_COLS: Col[] = [
  { key: "part_no", label: "Part", w: "w-[200px]" },
  { key: "period", label: "Period" },
  { key: "descr", label: "Description" },
  { key: "prev_qty", label: "Previous", right: true },
  { key: "qty", label: "Current", right: true },
  { key: "delta", label: "Change", right: true, w: "w-[170px]" },
  { key: "pct", label: "%", right: true },
  { key: "trend", label: "Trend" },
];

function download(name: string, bytes: Uint8Array | string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function ForecastGrid({ base, curr, query, setQuery, onOpenPart, title, labels, customer }: {
  base: number; curr: number; query: Query; setQuery: (q: Query) => void; onOpenPart: (id: number) => void;
  title: string; labels: { base: string; curr: string }; customer: string;
}) {
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<GridResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(query.filter.part ?? query.filter.descr ?? "");
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);
  const key = JSON.stringify([base, curr, query.mode, query.sort, query.desc, cleanFilter(query.filter)]);

  useEffect(() => setPage(0), [key]);
  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      grid(base, curr, query, PAGE, page * PAGE)
        .then((r) => { if (id === seq.current) { setRes(r); setError(null); } })
        .catch((e: Error) => id === seq.current && setError(e.message))
        .finally(() => id === seq.current && setLoading(false));
    }, 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);

  // the search box: anything with a digit is a part number, else a description
  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = search.trim();
      const f = { ...query.filter };
      delete f.part; delete f.descr;
      if (s) { if (/\d/.test(s)) f.part = s; else f.descr = s; }
      if (JSON.stringify(cleanFilter(f)) !== JSON.stringify(cleanFilter(query.filter))) setQuery({ ...query, filter: f });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => { setSearch(query.filter.part ?? query.filter.descr ?? ""); }, [query.filter.part, query.filter.descr]);

  const cols = query.mode === "part" ? PART_COLS : LINE_COLS;
  const maxAbs = useMemo(() => Math.max(1, ...(res?.rows ?? []).map((r) => Math.abs(Number(r.delta)))), [res]);
  const sortBy = (k: SortKey) => {
    const same = query.sort === k;
    setQuery({ ...query, sort: k, desc: same ? !query.desc : !["part_no", "descr", "period", "trend"].includes(k) });
  };
  const toggleTrend = (t: Trend) => {
    const cur = new Set(query.filter.trend ?? []);
    if (cur.has(t)) cur.delete(t); else cur.add(t);
    setQuery({ ...query, filter: { ...query.filter, trend: [...cur] } });
  };
  const chips = filterChips(query).filter((c) => c.key !== "part" && c.key !== "descr" && c.key !== "trend");

  const exportAll = async (kind: "xlsx" | "csv") => {
    setExporting(true);
    try {
      const all = await grid(base, curr, query, 50000, 0);
      const head = query.mode === "part"
        ? ["Part Number", "Description", `Previous (${labels.base})`, `Current (${labels.curr})`, "Qty Change", "% Change", "Trend", "Months Up", "Months Down", "Streak"]
        : ["Part Number", "Period", "Description", `Previous (${labels.base})`, `Current (${labels.curr})`, "Qty Change", "% Change", "Trend"];
      const rows = all.rows.map((r) => query.mode === "part"
        ? [r.part_no, r.descr, num0(r.prev_qty), num0(r.qty), Number(r.delta), r.pct == null ? null : Number(r.pct), r.trend, (r as PartRow).up, (r as PartRow).down, (r as PartRow).streak]
        : [r.part_no, (r as LineRow).period_label, r.descr, num0(r.prev_qty), num0(r.qty), Number(r.delta), r.pct == null ? null : Number(r.pct), r.trend]);
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `Watchman ${customer} ${labels.base} vs ${labels.curr} ${stamp}`.replace(/[^\w .-]+/g, "");
      if (kind === "xlsx") download(`${name}.xlsx`, writeXlsx("Forecast changes", [head, ...rows], [20, 34, 14, 14, 13, 10, 12, 10, 10, 8]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      else download(`${name}.csv`, [head, ...rows].map((r) => r.map((v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\n"), "text/csv");
    } finally {
      setExporting(false);
    }
  };

  const pages = res ? Math.max(1, Math.ceil(res.total / PAGE)) : 1;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-4 py-3">
        <h2 className="mr-2 text-[15px] font-semibold">{title}</h2>
        <div className="flex rounded-lg bg-sunken p-0.5 text-xs font-medium">
          {(["part", "line"] as const).map((m) => (
            <button key={m} onClick={() => setQuery({ ...query, mode: m })}
              className={cx("rounded-md px-2.5 py-1 transition", query.mode === m ? "bg-panel text-ink shadow-card" : "text-slate hover:text-ink")}>
              {m === "part" ? "By part" : "By month"}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Part # or description"
            className="h-8 w-52 rounded-lg border border-line bg-panel pl-8 pr-7 text-sm focus:border-amber focus:outline-none" />
          {search && <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <div className="flex flex-wrap gap-1">
          {TRENDS.filter((t) => query.mode === "part" || t !== "Shifted").map((t) => {
            const on = query.filter.trend?.includes(t);
            return (
              <button key={t} onClick={() => toggleTrend(t)} className={cx("rounded-full transition", on ? "ring-2 ring-amber" : "opacity-60 hover:opacity-100")}>
                <TrendPill trend={t} />
              </button>
            );
          })}
        </div>
        {chips.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-amber-soft px-2 py-0.5 text-[11px] font-medium text-amber-ink">
            {c.label}<button onClick={() => setQuery(withoutKey(query, c.key))} aria-label={`Remove ${c.label}`}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
          <button className="btn-outline h-8 px-2.5 text-xs" onClick={() => exportAll("xlsx")} disabled={exporting || !res?.total}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</button>
          <button className="btn-outline h-8 px-2.5 text-xs" onClick={() => exportAll("csv")} disabled={exporting || !res?.total}><Download className="h-3.5 w-3.5" /> CSV</button>
        </div>
      </div>

      {error && <div className="px-4 py-3 text-sm text-down">{error}</div>}
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-panel-2/95 backdrop-blur">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={cx("border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted", c.right ? "text-right" : "text-left", c.w)}>
                  <button onClick={() => sortBy(c.key)} className={cx("inline-flex items-center gap-1 hover:text-ink", query.sort === c.key && "text-ink")}>
                    {c.label}
                    {query.sort === c.key && (query.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
              {query.mode === "part" && <th className="border-b border-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Horizon</th>}
            </tr>
          </thead>
          <tbody>
            {!res && loading && [...Array(8)].map((_, i) => (
              <tr key={i}>{[...Array(cols.length + 1)].map((__, j) => <td key={j} className="border-b border-line px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>
            ))}
            {res?.rows.map((r) => {
              const d = Number(r.delta);
              const isPart = query.mode === "part";
              return (
                <tr key={isPart ? r.part_id : `${r.part_id}-${(r as LineRow).period}`} onClick={() => onOpenPart(r.part_id)}
                  className={cx("cursor-pointer transition-colors hover:bg-amber-soft/60", loading && "opacity-60")}>
                  <td className="border-b border-line px-3 py-2 font-mono text-[12.5px] font-medium text-navy">
                    <span className="inline-flex items-center gap-1.5">{r.part_no}<Streak n={r.streak} /></span>
                  </td>
                  {!isPart && <td className="border-b border-line px-3 py-2 tnum text-slate">{(r as LineRow).period_label}</td>}
                  <td className="max-w-[280px] truncate border-b border-line px-3 py-2 text-slate" title={r.descr ?? ""}>{r.descr ?? "—"}</td>
                  <td className="border-b border-line px-3 py-2 text-right tnum text-slate">{num(r.prev_qty)}</td>
                  <td className="border-b border-line px-3 py-2 text-right tnum font-medium">{num(r.qty)}</td>
                  <td className="border-b border-line px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <span className={cx("tnum font-semibold", d > 0 ? "text-up" : d < 0 ? "text-down" : "text-muted")}>{signed(d)}</span>
                      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-sunken">
                        <span className={cx("absolute inset-y-0 rounded-full", d >= 0 ? "left-1/2 bg-up" : "right-1/2 bg-down")}
                          style={{ width: `${(Math.abs(d) / maxAbs) * 50}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className={cx("border-b border-line px-3 py-2 text-right tnum text-xs", r.pct == null ? "text-muted" : Number(r.pct) > 0 ? "text-up" : Number(r.pct) < 0 ? "text-down" : "text-muted")}>{pct(r.pct)}</td>
                  <td className="border-b border-line px-3 py-2">
                    <span className="inline-flex items-center gap-1.5"><TrendPill trend={r.trend} />
                      {isPart && r.trend === "Shifted" && <span className="text-[11px] text-muted">{(r as PartRow).up}↑ {(r as PartRow).down}↓</span>}
                    </span>
                  </td>
                  {isPart && <td className="border-b border-line px-3 py-1.5"><Sparkline prev={(r as PartRow).prev_series.map(Number)} curr={(r as PartRow).series.map(Number)} /></td>}
                </tr>
              );
            })}
            {res && !res.rows.length && (
              <tr><td colSpan={cols.length + 1} className="px-4 py-14 text-center text-sm text-muted">Nothing matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {res && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-panel-2 px-4 py-2.5 text-xs text-slate">
          <span><b className="tnum text-ink">{num(res.total)}</b> {query.mode === "part" ? "parts" : `lines · ${num(res.parts)} parts`}</span>
          <span>Previous <b className="tnum text-ink">{num(res.sum_prev)}</b></span>
          <span>Current <b className="tnum text-ink">{num(res.sum_qty)}</b></span>
          <span>Net <b className={cx("tnum", Number(res.sum_delta) >= 0 ? "text-up" : "text-down")}>{signed(res.sum_delta)}</b></span>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost h-7 px-1.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <span className="tnum">Page {page + 1} of {num(pages)}</span>
            <button className="btn-ghost h-7 px-1.5" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </section>
  );
}

const num0 = (v: number | null) => (v == null ? null : Number(v));
