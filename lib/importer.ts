// Reads a customer forecast workbook into the payload import_snapshot() takes.
//
// Rules (from the original spec, unchanged):
//   * quantities come from the sheet named "PIVOT" (any case); the header row
//     starts with "Row Labels", then "Sum of Past", "Sum of 2026 M04", …
//   * the "Grand Total" row (and anything after) is ignored
//   * quantities are rounded to 2 decimals
// New: part descriptions are picked up from the raw detail sheet ("Sheet1")
// when it has a "Part Description" column.

import { readSheets, sheetNames, type Cell } from "@/lib/xlsx";

export type ParsedForecast = {
  periods: string[];
  rows: [string, string | null, number[]][];
  asOf: string | null;          // guessed from the file name (MM.DD.YY), else null
  parts: number;
  total: number;
  withDescr: number;
  ms: number;
  warnings: string[];
};

const PERIOD_RE = /^(past|\d{4}\s*M\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2})$/i;

export function guessAsOf(fileName: string): string | null {
  const m = fileName.match(/(\d{1,2})[._-](\d{1,2})[._-](\d{2,4})(?!\d)/);
  if (!m) return null;
  const [mm, dd, yy] = [Number(m[1]), Number(m[2]), m[3]];
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function parseForecastWorkbook(buf: ArrayBuffer, fileName: string): ParsedForecast {
  const t0 = performance.now();
  const names = sheetNames(buf);
  const pivotName = names.find((n) => n.trim().toLowerCase() === "pivot");
  if (!pivotName) throw new Error(`This file has no "PIVOT" sheet (found: ${names.join(", ") || "none"}).`);
  const detailName = names.find((n) => n.trim().toLowerCase() === "sheet1") ?? names.find((n) => n !== pivotName);

  const [pivot, detail] = readSheets(buf, detailName ? [pivotName, detailName] : [pivotName], { maxBlankRows: 200 });
  const warnings: string[] = [];

  const hi = pivot.rows.findIndex((r) => String(r?.[0] ?? "").trim().toLowerCase() === "row labels");
  if (hi < 0) throw new Error('The PIVOT sheet has no "Row Labels" header row.');
  const header = pivot.rows[hi];
  const cols: { col: number; label: string }[] = [];
  for (let c = 1; c < header.length; c++) {
    const raw = String(header[c] ?? "").trim();
    if (!raw || /^grand total$/i.test(raw)) continue;
    const label = raw.replace(/^sum of\s*/i, "").trim();
    if (PERIOD_RE.test(label)) cols.push({ col: c, label });
    else warnings.push(`Skipped column "${raw}"`);
  }
  if (!cols.length) throw new Error("No forecast period columns were found in the PIVOT sheet.");

  const descr = new Map<string, string>();
  if (detail) {
    const dh = detail.rows.findIndex((r) => r?.some((v) => /^part description$|^description$/i.test(String(v ?? "").trim())));
    if (dh >= 0) {
      const pc = detail.rows[dh].findIndex((v) => /^part( number| no\.?)?$/i.test(String(v ?? "").trim()));
      const dc = detail.rows[dh].findIndex((v) => /^part description$|^description$/i.test(String(v ?? "").trim()));
      for (const r of detail.rows.slice(dh + 1)) {
        const p = String(r?.[pc < 0 ? 0 : pc] ?? "").trim();
        const d = String(r?.[dc] ?? "").trim();
        if (p && d && !descr.has(p)) descr.set(p, d);
      }
    }
  }

  const rows: ParsedForecast["rows"] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const r of pivot.rows.slice(hi + 1)) {
    const part = String(r?.[0] ?? "").trim();
    if (!part) continue;
    if (/^grand total$/i.test(part)) break;
    if (seen.has(part)) warnings.push(`Part ${part} appears more than once — quantities were added together.`);
    seen.add(part);
    const q = cols.map(({ col }) => {
      const v: Cell = r[col];
      const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "")) || 0;
      return Math.round(n * 100) / 100;
    });
    total += q.reduce((a, b) => a + b, 0);
    rows.push([part, descr.get(part) ?? null, q]);
  }
  if (!rows.length) throw new Error("No part rows were found under the PIVOT header.");

  return {
    periods: cols.map((c) => c.label),
    rows,
    asOf: guessAsOf(fileName),
    parts: seen.size,
    total: Math.round(total * 100) / 100,
    withDescr: rows.filter((r) => r[1]).length,
    ms: Math.round(performance.now() - t0),
    warnings: warnings.slice(0, 8),
  };
}
