// Plain-English → Query, without AI. Used when the Claude engine isn't
// configured or can't be reached, and to clean up voice transcripts.
// Pure TypeScript with no imports beyond types, so the Edge Function can share it.

import type { Filter, Query, SortKey, Trend } from "./query";

export type Understood = { query: Query; notes: string[]; count: boolean };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const DESCR_WORDS = [
  "capacitor", "resistor", "connector", "washer", "screw", "bolt", "nut", "rivet", "diode", "cable", "spacer",
  "fastener", "insert", "pin", "clamp", "gasket", "o-ring", "inductor", "transistor", "relay", "fuse", "terminal",
  "bushing", "bracket", "spring", "shim", "standoff", "grommet", "switch", "oscillator", "crystal", "filter",
];

const NUM_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

const SMALL: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Voice transcripts: "one one four eight dash a three" → "1148-A3", "ten percent" → "10%" */
export function normalizeSpoken(s: string): string {
  let t = ` ${s} `.replace(/\b(dash|hyphen)\b/gi, " - ").replace(/\bpercent\b/gi, "%");
  t = t.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, (w) => NUM_WORDS[w.toLowerCase()]);
  t = t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](\d)\b/gi, (_, a: string, b: string) => String(SMALL[a.toLowerCase()] + Number(b)));
  t = t.replace(/\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi, (w) => String(SMALL[w.toLowerCase()]));
  t = t.replace(/(\d+)\s+(hundred|thousand)\b/gi, (_, n: string, u: string) => String(Number(n) * (u.toLowerCase() === "hundred" ? 100 : 1000)));
  // join runs of spoken characters: digits, single letters and dashes → one part number
  const tokens = t.trim().split(/\s+/);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    const digits = run.join("").replace(/\D/g, "").length;
    if (run.length > 1 && digits >= 3) out.push(run.join("").toUpperCase());
    else out.push(...run);
    run = [];
  };
  for (const tok of tokens) {
    if (/^\d+$/.test(tok) || tok === "-" || (/^[a-z]$/i.test(tok) && run.length)) run.push(tok);
    else { flush(); out.push(tok); }
  }
  flush();
  return out.join(" ").replace(/(\d)\s+%/g, "$1%").replace(/\s*-\s*(?=[A-Z0-9])/g, (m) => (m.includes(" ") ? m : m));
}

const numberIn = (s: string) => {
  const m = s.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|million)?/i);
  if (!m) return null;
  let v = Number(m[1].replace(/,/g, ""));
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "k" || unit === "thousand") v *= 1000;
  if (unit === "m" || unit === "million") v *= 1_000_000;
  return v;
};

function periodLabel(y: number, m: number) {
  return `${y} M${String(m).padStart(2, "0")}`;
}

/** All period mentions: "2026 M09", "M09 2026", "December 2026", "dec '26", "past due". */
export function findPeriods(text: string, defaultYear: number): string[] {
  const out: string[] = [];
  const t = text.toLowerCase();
  for (const m of t.matchAll(/\b(\d{4})\s*m(\d{1,2})\b/g)) out.push(periodLabel(+m[1], +m[2]));
  for (const m of t.matchAll(/\bm(\d{1,2})\s*(\d{4})\b/g)) out.push(periodLabel(+m[2], +m[1]));
  for (const m of t.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s*(?:of\s*)?('?\d{2,4})?/g)) {
    if (m[1] === "may" && !m[2]) continue; // "may" is usually the verb
    const yr = m[2] ? Number(m[2].replace("'", "")) : defaultYear;
    out.push(periodLabel(yr < 100 ? 2000 + yr : yr, MONTHS[m[1]]));
  }
  if (/\bpast[- ]?due\b|\bthe past bucket\b|\bin the past\b/.test(t)) out.push("Past");
  if (/\bm(\d{1,2})\b/.test(t) && !out.length) {
    const m = t.match(/\bm(\d{1,2})\b/)!;
    out.push(periodLabel(defaultYear, +m[1]));
  }
  return [...new Set(out)];
}

/** Part numbers: tokens with digits and (dashes or letters), 5+ chars, that aren't periods/years/numbers. */
export function findParts(text: string): string[] {
  return [...text.matchAll(/\b([A-Z]{0,5}\d[A-Z0-9]*(?:-[A-Z0-9]+)*|[A-Z]{1,5}\d[A-Z0-9-]*)\b/gi)]
    .map((m) => m[1].toUpperCase())
    .filter((p) => p.length >= 5 && /\d/.test(p) && (/[A-Z]/.test(p) || p.includes("-")) && !/^\d{4}M\d{1,2}$/.test(p) && !/^M\d{1,2}$/.test(p))
    .filter((p) => !/^\d+(K|M)$/.test(p));
}

export function understand(question: string, opts: { previous?: Query | null; defaultYear?: number } = {}): Understood {
  const text = normalizeSpoken(question);
  const t = ` ${text.toLowerCase()} `;
  const notes: string[] = [];
  const year = opts.defaultYear ?? new Date().getFullYear();

  // follow-ups ("now only capacitors", "and just the new ones") refine the previous query
  const refine = !!opts.previous && /^\s*(now|and|also|only|just|of those|then|but|what about|narrow|filter)\b/i.test(text);
  const f: Filter = refine ? { ...opts.previous!.filter } : {};
  let mode: Query["mode"] = refine ? opts.previous!.mode : "part";
  let sort: SortKey | undefined = refine ? opts.previous!.sort : undefined;
  let desc = refine ? opts.previous!.desc ?? true : true;

  // --- parts
  const parts = findParts(text);
  if (parts.length === 1) f.part = parts[0];
  else if (parts.length > 1) f.parts = parts;

  // --- description words ("capacitors", "all the washers")
  const word = DESCR_WORDS.find((w) => new RegExp(`\\b${w}s?\\b`).test(t));
  if (word) f.descr = word;

  // --- periods
  const periods = findPeriods(text, year);
  const range = t.match(/\b(?:between|from)\s+(.+?)\s+(?:and|to|through|thru)\s+(.+?)(?:\s|$)/);
  if (range && periods.length >= 2) {
    f.period_from = periods[0];
    f.period_to = periods[1];
  } else if (/\b(after|from|starting|beyond|later than)\b/.test(t) && periods.length === 1) {
    f.period_from = periods[0];
  } else if (/\b(before|through|until|up to|earlier than)\b/.test(t) && periods.length === 1) {
    f.period_to = periods[0];
  } else if (periods.length) {
    f.periods = periods;
  }
  if (periods.length) mode = "line";

  // --- direction words
  const up = /\b(increase[ds]?|increasing|went up|go(?:ne|es)? up|higher|grew|grow(?:n|ing)?|rose|rising|up(?:ward)?|raised|more demand|gain(?:ed|s)?)\b/.test(t);
  const down = /\b(decrease[ds]?|decreasing|went down|go(?:ne|es)? down|lower(?:ed)?|dropped|drop(?:s|ping)?|fell|falling|cut|reduced|down(?:ward)?|less demand|declin(?:e|ed|ing))\b/.test(t)
    && !/\bdropped off\b/.test(t);
  const trending = /\btr[ae]nd(?:ing)\b/.test(t);
  const trends: Trend[] = [];

  if (/\b(new|added|appeared|first time)\b/.test(t) && !/\bnew quantit/.test(t)) trends.push("New");
  if (/\b(removed|dropped off|gone|disappeared|no longer|went away|fell off)\b/.test(t)) trends.push("Removed");
  if (/\b(shifted|reschedul|pulled in|pushed out|pull[- ]ins?|push[- ]outs?|moved between months|timing)\b/.test(t)) trends.push("Shifted");
  if (/\b(unchanged|no change|didn'?t change|stayed the same|flat|stable|same)\b/.test(t)) trends.push("No Change");

  // --- numbers
  const pctM = t.match(/(-?\d+(?:\.\d+)?)\s*%/);
  const cmpRe = /\b(above|over|more than|greater than|at least|exceed(?:s|ing)?|>=?|bigger than|larger than|minimum of|min)\s*(?:a |an )?(?:qty |quantity |change |of )?(-?\d[\d,]*(?:\.\d+)?\s*(?:k|thousand|m|million)?)\b/;
  const ltRe = /\b(below|under|less than|fewer than|at most|<=?|smaller than|maximum of|max)\s*(-?\d[\d,]*(?:\.\d+)?\s*(?:k|thousand|m|million)?)\b/;
  const changeWords = /\b(chang(?:e|ed|es|ing)|moved|delta|differ|swing|varian|movement|by)\b/.test(t) || up || down || trending;

  if (pctM) {
    const v = Math.abs(Number(pctM[1]));
    if (up && !down) f.pct_min = v;
    else if (down && !up) f.pct_max = -v;
    else f.abs_pct_min = v;
    if (/\b(less than|under|below|at most)\s*-?\d+(?:\.\d+)?\s*%/.test(t)) {
      delete f.pct_min; delete f.pct_max; delete f.abs_pct_min;
      notes.push("Small-change filters use the % column; showing parts that moved less than that is approximate.");
      f.pct_max = v; f.pct_min = -v;
    }
  } else {
    const gt = t.match(cmpRe);
    const lt = t.match(ltRe);
    if (gt) {
      const v = numberIn(gt[2])!;
      if (changeWords) {
        if (down && !up) f.delta_max = -Math.abs(v);
        else if (up || trending) f.delta_min = Math.abs(v);
        else f.abs_delta_min = Math.abs(v);
      } else f.qty_min = v;
    }
    if (lt) {
      const v = numberIn(lt[2])!;
      if (changeWords && !gt) notes.push(`Read “${lt[0].trim()}” as current quantity.`);
      f.qty_max = v;
    }
  }

  // --- trend direction
  if (trending) {
    // "trending" = moving the same way across consecutive imports
    if (down && !up) { f.streak_max = -2; trends.push("Decreased"); }
    else { f.streak_min = 2; trends.push("Increased"); }
  } else {
    if (up && !down) trends.push("Increased");
    if (down && !up) trends.push("Decreased");
  }
  if (/\b(changed|changes|any change|that moved|moved)\b/.test(t) && !trends.length && f.abs_pct_min == null && f.abs_delta_min == null)
    f.changed_only = true;
  if (trends.length) f.trend = [...new Set(trends)];

  // trending streaks are only meaningful with 3+ snapshots — say so
  if (f.streak_min || f.streak_max) notes.push("“Trending” = moved the same way in at least the last two imports.");

  // --- month / period detail
  if (/\b(months?|periods?|buckets?|by month|which months|month by month|records|lines|rows)\b/.test(t)) mode = "line";
  if (mode === "line" && f.part && !periods.length && /\b(months?|periods?)\b/.test(t) && !f.trend) f.changed_only = /\bchang/.test(t) || f.changed_only;

  // --- ordering
  if (/\b(most|biggest|largest|top|greatest|highest)\b/.test(t)) {
    if (/\b(percent|%|pct|percentage)\b/.test(t)) sort = "pct";
    else if (/\b(quantit|demand|volume|qty)\b/.test(t) && !changeWords) sort = "qty";
    else sort = "delta";
    desc = !(down && !up);
  } else if (/\b(smallest|least|lowest)\b/.test(t)) {
    sort = /\b(quantit|demand|qty)\b/.test(t) ? "qty" : "delta";
    desc = false;
  } else if (/\b(alphabetic|by part|part order|sorted by part)\b/.test(t)) {
    sort = "part_no"; desc = false;
  }
  if (!sort) sort = f.part || f.parts ? "part_no" : "impact";
  if (sort === "part_no" || sort === "period") desc = false;

  const count = /\bhow many\b|\bcount\b|\bnumber of\b/.test(t);
  return { query: { filter: f, mode, sort, desc }, notes, count };
}
