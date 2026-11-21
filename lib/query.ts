// The one query shape every part of Watchman speaks: KPI cards, the grid's
// own filters, saved questions, and the AI's interpretation of a question all
// produce a Query, and the database runs it (compare_grid).

export type Trend = "Increased" | "Decreased" | "No Change" | "Shifted" | "New" | "Removed";
export const TRENDS: Trend[] = ["Increased", "Decreased", "Shifted", "No Change", "New", "Removed"];

export type Filter = {
  part?: string;
  descr?: string;
  parts?: string[];
  periods?: string[];
  period_from?: string;
  period_to?: string;
  trend?: Trend[];
  qty_min?: number;
  qty_max?: number;
  prev_min?: number;
  prev_max?: number;
  delta_min?: number;
  delta_max?: number;
  abs_delta_min?: number;
  pct_min?: number;
  pct_max?: number;
  abs_pct_min?: number;
  streak_min?: number;
  streak_max?: number;
  changed_only?: boolean;
};

export type Mode = "part" | "line";
export type SortKey = "part_no" | "descr" | "period" | "prev_qty" | "qty" | "delta" | "pct" | "streak" | "trend" | "impact";

export type Query = {
  filter: Filter;
  mode: Mode;
  sort?: SortKey;
  desc?: boolean;
};

export const EMPTY_QUERY: Query = { filter: {}, mode: "part", sort: "impact", desc: true };

export type PartRow = {
  part_id: number; part_no: string; descr: string | null;
  prev_qty: number | null; qty: number | null; delta: number; pct: number | null;
  trend: Trend; up: number; down: number; streak: number;
  prev_series: number[]; series: number[];
};
export type LineRow = {
  part_id: number; part_no: string; descr: string | null; period: string; period_label: string;
  prev_qty: number | null; qty: number | null; delta: number; pct: number | null; trend: Trend; streak: number;
};
export type GridResult = {
  total: number; parts: number; sum_prev: number; sum_qty: number; sum_delta: number;
  rows: (PartRow | LineRow)[];
};

/** Drop empty values so filters compare and serialize cleanly. */
export function cleanFilter(f: Filter): Filter {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length) || v === false) continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out as Filter;
}

const n = (v: number) => new Intl.NumberFormat("en-US").format(v);

/** Human chips for a filter: [{key, label}] — each removable. */
export function filterChips(q: Query): { key: keyof Filter | "mode"; label: string }[] {
  const f = q.filter;
  const chips: { key: keyof Filter | "mode"; label: string }[] = [];
  if (f.part) chips.push({ key: "part", label: `Part contains “${f.part}”` });
  if (f.parts?.length) chips.push({ key: "parts", label: f.parts.length === 1 ? `Part ${f.parts[0]}` : `${f.parts.length} parts` });
  if (f.descr) chips.push({ key: "descr", label: `Description “${f.descr}”` });
  if (f.trend?.length) chips.push({ key: "trend", label: f.trend.join(" / ") });
  if (f.periods?.length) chips.push({ key: "periods", label: f.periods.length > 3 ? `${f.periods.length} periods` : f.periods.join(", ") });
  if (f.period_from) chips.push({ key: "period_from", label: `From ${f.period_from}` });
  if (f.period_to) chips.push({ key: "period_to", label: `Through ${f.period_to}` });
  if (f.qty_min != null) chips.push({ key: "qty_min", label: `Qty ≥ ${n(f.qty_min)}` });
  if (f.qty_max != null) chips.push({ key: "qty_max", label: `Qty ≤ ${n(f.qty_max)}` });
  if (f.prev_min != null) chips.push({ key: "prev_min", label: `Prev ≥ ${n(f.prev_min)}` });
  if (f.prev_max != null) chips.push({ key: "prev_max", label: `Prev ≤ ${n(f.prev_max)}` });
  if (f.delta_min != null) chips.push({ key: "delta_min", label: `Change ≥ ${f.delta_min > 0 ? "+" : ""}${n(f.delta_min)}` });
  if (f.delta_max != null) chips.push({ key: "delta_max", label: `Change ≤ ${n(f.delta_max)}` });
  if (f.abs_delta_min != null) chips.push({ key: "abs_delta_min", label: `Moved ±${n(f.abs_delta_min)}+` });
  if (f.pct_min != null) chips.push({ key: "pct_min", label: `% change ≥ ${f.pct_min}%` });
  if (f.pct_max != null) chips.push({ key: "pct_max", label: `% change ≤ ${f.pct_max}%` });
  if (f.abs_pct_min != null) chips.push({ key: "abs_pct_min", label: `Moved ±${f.abs_pct_min}%+` });
  if (f.streak_min != null) chips.push({ key: "streak_min", label: `Up ${f.streak_min}+ imports in a row` });
  if (f.streak_max != null) chips.push({ key: "streak_max", label: `Down ${Math.abs(f.streak_max)}+ imports in a row` });
  if (f.changed_only) chips.push({ key: "changed_only", label: "Changed only" });
  return chips;
}

export function withoutKey(q: Query, key: keyof Filter | "mode"): Query {
  if (key === "mode") return { ...q, mode: "part" };
  const f = { ...q.filter };
  delete f[key];
  return { ...q, filter: f };
}

export const isEmpty = (q: Query) => Object.keys(cleanFilter(q.filter)).length === 0;
