"use client";

import { supabase } from "@/lib/supabaseClient";
import { cleanFilter, type GridResult, type Query } from "@/lib/query";

// Thin wrappers over the database functions. Everything runs as the signed-in
// person; row-level security decides what comes back.

export type Snapshot = {
  id: number; as_of: string; label: string; file_name: string | null; part_count: number;
  total_qty: number; periods: number; import_ms: number | null; created_at: string;
  up: number; down: number; new: number; removed: number;
};
export type Dataset = { id: string; name: string; customer: string };
export type Member = {
  id: string; email: string; first_name: string; last_name: string; login_name: string | null;
  mobile: string | null; role: "admin" | "manager" | "user"; is_active: boolean; two_factor_method: string | null;
  last_activity_at: string | null; tenant_id: string;
};
export type Who = { member: Member | null; tenant: { id: string; code: string; name: string } | null; datasets: Dataset[] };

export type Summary = {
  parts: number; parts_all: number; up: number; down: number; flat: number; shifted: number; new: number; removed: number;
  trending_up: number; trending_down: number; lines_changed: number; lines: number;
  prev_total: number; total: number; net: number;
  wf: { increases: number; decreases: number; added: number; dropped: number };
  top_up: Mover | null; top_down: Mover | null; top_pct: Mover | null;
  by_period: { period: string; up: number; down: number; net: number; prev: number; qty: number }[];
  periods: string[];
};
export type Mover = { part_id: number; part_no: string; descr: string | null; delta: number; pct: number | null };

export type PartHistory = {
  part: { id: number; part_no: string; descr: string | null };
  snapshots: { id: number; as_of: string; label: string; total: number; trend: string | null; delta: number | null; streak: number | null;
    lines: { period: string; date: string; qty: number }[] }[];
};

const unwrap = <T,>({ data, error }: { data: unknown; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const whoami = async () => unwrap<Who>(await supabase.rpc("whoami"));
export const overview = async (dataset: string) =>
  unwrap<{ snapshots: Snapshot[] }>(await supabase.rpc("dataset_overview", { p_dataset: dataset })).snapshots;
export const summary = async (base: number, curr: number) =>
  unwrap<Summary>(await supabase.rpc("compare_summary", { p_base: base, p_curr: curr }));
export const partHistory = async (part: number) => unwrap<PartHistory>(await supabase.rpc("part_history", { p_part: part }));
export const searchParts = async (dataset: string, q: string, limit = 12) =>
  unwrap<{ id: number; part_no: string; descr: string | null }[]>(await supabase.rpc("search_parts", { p_dataset: dataset, q, p_limit: limit }));

export async function grid(base: number, curr: number, q: Query, limit = 100, offset = 0): Promise<GridResult> {
  return unwrap<GridResult>(
    await supabase.rpc("compare_grid", {
      p_base: base, p_curr: curr, f: cleanFilter(q.filter), p_mode: q.mode,
      p_sort: q.sort === "impact" ? null : q.sort ?? null, p_desc: q.desc ?? true, p_limit: limit, p_offset: offset,
    })
  );
}

export type HorizonHistory = { id: number; as_of: string; periods: { period: string; qty: number }[] }[];
export const horizonHistory = async (dataset: string) => unwrap<HorizonHistory>(await supabase.rpc("horizon_history", { p_dataset: dataset }));
