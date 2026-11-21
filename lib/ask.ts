"use client";

import { supabase } from "@/lib/supabaseClient";
import { grid } from "@/lib/data";
import { understand } from "@/lib/understand";
import type { GridResult, Query } from "@/lib/query";

export type AskResult = {
  question: string;
  query: Query;
  interpretation: string;
  summary: string;
  result: GridResult;
  engine: "claude" | "local";
  notes: string[];
  ms: number;
};

const fmt = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const sgn = (v: number) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : "0");

// Deterministic answer line (built-in engine): counts and the top movers.
function describe(q: Query, r: GridResult, count: boolean, ctx: { base: string; curr: string; horizon: string[] }): string {
  const what = q.mode === "part" ? "part" : "forecast line";
  if (!r.total) {
    const missing = (q.filter.periods ?? []).filter((p) => !ctx.horizon.includes(p));
    if (missing.length)
      return `${missing.join(", ")} isn't in these snapshots. The horizon runs ${ctx.horizon[0]} through ${ctx.horizon.at(-1)}.`;
    return "Nothing matched. Try removing a filter chip below, or ask more broadly.";
  }
  const plural = (n: number, w: string) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;
  const head = count
    ? `${plural(r.parts, "part")} match (${plural(r.total, what)}).`
    : `${plural(r.total, what)}${q.mode === "line" ? ` across ${plural(r.parts, "part")}` : ""} match, ${ctx.base} → ${ctx.curr}.`;
  const net = ` Net change ${sgn(Number(r.sum_delta))} (${fmt(Number(r.sum_prev))} → ${fmt(Number(r.sum_qty))}).`;
  const top = r.rows[0] as { part_no: string; delta: number; pct: number | null; period_label?: string } | undefined;
  const lead = top && Number(top.delta) !== 0
    ? ` Leading: ${top.part_no}${top.period_label ? ` (${top.period_label})` : ""} ${sgn(Number(top.delta))}${top.pct != null ? ` (${Number(top.pct) > 0 ? "+" : ""}${top.pct}%)` : ""}.`
    : "";
  return head + net + lead;
}

export async function ask(opts: {
  question: string; base: number; curr: number; previous: Query | null; source: "typed" | "voice" | "saved";
  labels: { base: string; curr: string }; horizon: string[];
}): Promise<AskResult> {
  const t0 = performance.now();
  let out: AskResult | null = null;

  try {
    const { data, error } = await supabase.functions.invoke("ask", {
      body: { question: opts.question, base: opts.base, curr: opts.curr, previous: opts.previous },
    });
    if (!error && data?.engine === "claude") {
      out = {
        question: opts.question, query: data.query, interpretation: data.interpretation,
        summary: data.summary ?? describe(data.query, data.result, !!data.count, { ...opts.labels, horizon: opts.horizon }),
        result: data.result, engine: "claude", notes: [], ms: 0,
      };
    }
  } catch {
    /* fall through to the built-in engine */
  }

  if (!out) {
    const u = understand(opts.question, { previous: opts.previous, defaultYear: new Date().getFullYear() });
    const result = await grid(opts.base, opts.curr, u.query, 100, 0);
    out = {
      question: opts.question, query: u.query, interpretation: "", engine: "local", notes: u.notes,
      summary: describe(u.query, result, u.count, { ...opts.labels, horizon: opts.horizon }), result, ms: 0,
    };
  }
  out.ms = Math.round(performance.now() - t0);

  // history (and the zero-result review list) — best effort
  const { data: me } = await supabase.rpc("whoami");
  const tenant = me?.member?.tenant_id;
  const { data: u } = await supabase.auth.getUser();
  if (tenant && u.user) {
    supabase.from("question").insert({
      tenant_id: tenant, user_id: u.user.id, text: opts.question, source: opts.source, filter: out.query,
      summary: out.summary, result_count: out.result.total, engine: out.engine, ms: out.ms,
    }).then(() => undefined);
  }
  return out;
}
