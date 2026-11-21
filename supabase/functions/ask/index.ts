// Watchman — "Ask" Edge Function.
//
// Turns a plain-English (or spoken) question into a Watchman Query using
// Claude, runs it AS THE SIGNED-IN PERSON (their JWT → row-level security),
// and writes a short answer from the actual results.
//
// The field dictionary (field_def) is read from the database on every call,
// so editing a synonym on the Dictionary screen changes how questions are
// understood — no redeploy.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   required for the Claude engine
//   ANTHROPIC_MODEL     optional, default claude-sonnet-5-5 (interpretation)
//   ANTHROPIC_FAST_MODEL optional, default claude-haiku-5-5 (the written answer)
// Without a key the function answers {engine:"unavailable"} and the app uses
// its built-in parser instead.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const TRENDS = ["Increased", "Decreased", "No Change", "Shifted", "New", "Removed"];

const QUERY_TOOL = {
  name: "run_query",
  description: "Run a Watchman forecast comparison query that answers the user's question.",
  input_schema: {
    type: "object",
    properties: {
      interpretation: { type: "string", description: "One short sentence, in plain words, of what you will show (e.g. 'Capacitors whose total forecast went up, biggest first')." },
      count: { type: "boolean", description: "True when the user asked how many / a count." },
      mode: { type: "string", enum: ["part", "line"], description: "part = one row per part (totals across the horizon). line = one row per part per forecast period (month)." },
      sort: { type: "string", enum: ["impact", "part_no", "descr", "period", "prev_qty", "qty", "delta", "pct", "streak", "trend"] },
      desc: { type: "boolean" },
      filter: {
        type: "object",
        properties: {
          part: { type: "string", description: "Part number contains" },
          parts: { type: "array", items: { type: "string" }, description: "Exact list of part numbers" },
          descr: { type: "string", description: "Description contains, e.g. capacitor" },
          periods: { type: "array", items: { type: "string" }, description: "Exact period labels from the horizon list" },
          period_from: { type: "string" }, period_to: { type: "string" },
          trend: { type: "array", items: { type: "string", enum: TRENDS } },
          qty_min: { type: "number" }, qty_max: { type: "number" },
          prev_min: { type: "number" }, prev_max: { type: "number" },
          delta_min: { type: "number" }, delta_max: { type: "number" }, abs_delta_min: { type: "number" },
          pct_min: { type: "number" }, pct_max: { type: "number" }, abs_pct_min: { type: "number" },
          streak_min: { type: "integer" }, streak_max: { type: "integer" },
          changed_only: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
    required: ["interpretation", "mode", "filter"],
  },
};

async function claude(key: string, model: string, body: Record<string, unknown>) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, ...body }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

const label = (d: string, tail: string | null) =>
  d === "1900-01-01" ? "Past" : tail && d === tail ? `${d.slice(0, 4)}+` : `${d.slice(0, 4)} M${d.slice(5, 7)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const t0 = Date.now();
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ engine: "unavailable", reason: "no_key" });

    const auth = req.headers.get("Authorization") ?? "";
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { question, base, curr, previous } = await req.json();
    if (!question || !base || !curr) return json({ error: "question, base and curr are required" }, 400);

    const [{ data: fields, error: fe }, { data: snaps, error: se }] = await Promise.all([
      db.from("field_def").select("tenant_id,key,label,kind,synonyms,allowed,notes,filterable,sort_order").order("sort_order"),
      db.from("snapshot").select("id,as_of,label,periods,tail_from").in("id", [base, curr]),
    ]);
    if (fe || se) return json({ error: (fe ?? se)!.message }, 403);
    if (!snaps || snaps.length < 2) return json({ error: "Snapshots not found" }, 404);

    // tenant rows override engine defaults
    const dict = new Map<string, Record<string, unknown>>();
    for (const f of fields ?? []) if (!dict.has(f.key as string) || f.tenant_id) dict.set(f.key as string, f);
    const dictionary = [...dict.values()].map((f) =>
      `- ${f.label} [${f.key}, ${f.kind}${f.filterable ? "" : ", not filterable"}]` +
      `${(f.allowed as string[]).length ? ` values: ${(f.allowed as string[]).join(", ")}.` : ""}` +
      ` Synonyms: ${(f.synonyms as string[]).join(", ")}. ${f.notes}`).join("\n");

    const b = snaps.find((s) => s.id === base)!;
    const c = snaps.find((s) => s.id === curr)!;
    const horizon = (c.periods as string[]).filter((p) => (b.periods as string[]).includes(p)).map((p) => label(p, c.tail_from));

    const system = `You turn questions about a customer's demand forecast into a query for the Watchman Forecasting app.
The app compares two dated snapshots (imports) of the same 18-month rolling forecast:
BASE = "${b.label}" (older) and CURRENT = "${c.label}" (newer). Questions are about how the forecast changed between them.

FIELD DICTIONARY (source of truth — use only these fields and values):
${dictionary}

FORECAST PERIODS AVAILABLE (exact labels): ${horizon.join(", ")}

RULES
- Prefer mode "part" (one row per part, totals over the horizon) unless the question is about specific months/periods, records/lines, or "which months" → mode "line".
- Only set trend when the user implies a direction or category (up, down, new, removed, unchanged, shifted/rescheduled/pulled in/pushed out). Words like show/list/display/all are not trends.
- "Trending" means moving the same way in consecutive imports: trending up → trend [Increased] + streak_min 2; trending down → trend [Decreased] + streak_max -2. "Trending above N" → also delta_min N.
- "Changed by X% or more" with no direction → abs_pct_min X. "Up more than X%" → pct_min X. "Down more than X%" → pct_max -X.
- "Changed by N or more" with no direction → abs_delta_min N. "Demand/quantity above N" → qty_min N.
- Biggest increases → sort delta desc. Biggest drops → sort delta asc (desc false). Default sort: impact.
- A period like "2026 M12" or "December 2026" is a forecast period (periods), never a snapshot date. If the user names a period not in the list, still put it in periods (the answer will explain it isn't in this horizon).
- Part numbers: use "part" (contains) for one, "parts" for several exact ones. Descriptions like capacitors/washers → descr (singular, lowercase).
- Follow-ups ("now only capacitors", "just the new ones") refine the PREVIOUS query; otherwise start fresh.
PREVIOUS QUERY: ${previous ? JSON.stringify(previous) : "none"}`;

    const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
    const interp = await claude(key, model, {
      max_tokens: 800,
      system,
      tools: [QUERY_TOOL],
      tool_choice: { type: "tool", name: "run_query" },
      messages: [{ role: "user", content: String(question).slice(0, 1000) }],
    });
    const call = (interp.content ?? []).find((x: { type: string }) => x.type === "tool_use");
    if (!call) return json({ engine: "unavailable", reason: "no_tool_call" });
    const q = call.input as { interpretation: string; count?: boolean; mode: "part" | "line"; sort?: string; desc?: boolean; filter: Record<string, unknown> };
    const query = { filter: q.filter ?? {}, mode: q.mode === "line" ? "line" : "part", sort: q.sort ?? "impact", desc: q.desc ?? !["part_no", "period", "descr"].includes(q.sort ?? "") };

    const { data: result, error: ge } = await db.rpc("compare_grid", {
      p_base: base, p_curr: curr, f: query.filter, p_mode: query.mode,
      p_sort: query.sort === "impact" ? null : query.sort, p_desc: query.desc, p_limit: 100, p_offset: 0,
    });
    if (ge) return json({ error: ge.message }, 400);

    const sample = (result.rows as Record<string, unknown>[]).slice(0, 15).map((r) => ({
      part: r.part_no, descr: r.descr, period: r.period_label, prev: r.prev_qty, qty: r.qty, change: r.delta, pct: r.pct, trend: r.trend, streak: r.streak,
    }));
    const fast = Deno.env.get("ANTHROPIC_FAST_MODEL") ?? "claude-haiku-5-5";
    const answer = await claude(key, fast, {
      max_tokens: 300,
      system: `You write the answer line for a forecast analytics app. 2-3 sentences, plain and specific: counts, part numbers, quantities and changes from the data given. Format numbers with thousands separators. Never invent data. If there are no rows, say so plainly and suggest one concrete way to broaden the question (if a period isn't in the available list, say which periods are available). Snapshots compared: ${b.label} → ${c.label}.`,
      messages: [{
        role: "user",
        content: `Question: ${question}\nShown: ${q.interpretation}\nMode: ${query.mode === "part" ? "one row per part" : "one row per part per month"}\n` +
          `Totals: ${result.total} rows, ${result.parts} distinct parts, previous ${result.sum_prev}, current ${result.sum_qty}, net change ${result.sum_delta}\n` +
          `Available periods: ${horizon.join(", ")}\nTop rows: ${JSON.stringify(sample)}${q.count ? "\nThe user asked for a count — lead with the number." : ""}`,
      }],
    }).catch(() => null);
    const summary = answer?.content?.find((x: { type: string }) => x.type === "text")?.text?.trim() ?? null;

    return json({ engine: "claude", query, interpretation: q.interpretation, count: !!q.count, summary, result, ms: Date.now() - t0 });
  } catch (e) {
    return json({ engine: "unavailable", reason: String((e as Error).message ?? e).slice(0, 300) });
  }
});
