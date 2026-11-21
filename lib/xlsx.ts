// A small, fast .xlsx reader/writer (no SheetJS).
//
// Reading: only the parts of the zip we need are decompressed (workbook,
// shared strings, and the sheets asked for), so a workbook whose other sheet
// has a million formatted-but-empty rows still opens in a blink.
// Writing: a plain one-sheet workbook with a bold header row, for exports.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type Cell = string | number | boolean | null;
export type Sheet = { name: string; rows: Cell[][] };

const decode = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "amp" ? "&" : e === "quot" ? '"' : e === "apos" ? "'" :
    String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));

const textOf = (xml: string) => {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1];
  return decode(out);
};

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
};

/** Names of the sheets, in workbook order (cheap: reads only the workbook part). */
export function sheetNames(buf: ArrayBuffer | Uint8Array): string[] {
  const files = unzipSync(buf instanceof Uint8Array ? buf : new Uint8Array(buf), { filter: (f) => f.name === "xl/workbook.xml" });
  const wb = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
  return [...wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decode(m[1]));
}

/**
 * Read the named sheets (case-insensitive). `maxBlankRows` stops reading a
 * sheet after that many empty rows in a row (protects against bloated sheets).
 */
export function readSheets(buf: ArrayBuffer | Uint8Array, wanted: string[], opts: { maxBlankRows?: number; maxCols?: number } = {}): Sheet[] {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const meta = unzipSync(u8, { filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" });
  const wb = strFromU8(meta["xl/workbook.xml"] ?? new Uint8Array());
  const rels = strFromU8(meta["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = m[1].match(/\bId="([^"]+)"/)?.[1];
    const target = m[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) relTarget.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const sheets = [...wb.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    name: decode(m[1].match(/\bname="([^"]*)"/)?.[1] ?? ""),
    path: "xl/" + (relTarget.get(m[1].match(/\br:id="([^"]+)"/)?.[1] ?? "") ?? ""),
  }));
  const pick = wanted
    .map((w) => sheets.find((s) => s.name.trim().toLowerCase() === w.trim().toLowerCase()))
    .filter((s): s is { name: string; path: string } => !!s);
  if (!pick.length) return [];

  const need = new Set(["xl/sharedStrings.xml", ...pick.map((p) => p.path)]);
  const files = unzipSync(u8, { filter: (f) => need.has(f.name) });
  const sst: string[] = [];
  const sstXml = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  for (const m of sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) sst.push(textOf(m[1]));

  return pick.map(({ name, path }) => {
    const xml = files[path] ? strFromU8(files[path]) : "";
    const rows: Cell[][] = [];
    let blank = 0;
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(xml))) {
      const r = Number(rm[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1) - 1;
      const body = rm[2] ?? "";
      const row: Cell[] = [];
      let any = false;
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(body))) {
        const attrs = cm[1];
        const inner = cm[2] ?? "";
        const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
        const c = ref ? colIndex(ref) : row.length;
        if (opts.maxCols && c >= opts.maxCols) continue;
        const t = attrs.match(/\bt="([^"]+)"/)?.[1];
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val: Cell = null;
        if (t === "s") val = v != null ? sst[Number(v)] ?? "" : null;
        else if (t === "inlineStr") val = textOf(inner);
        else if (t === "str") val = v != null ? decode(v) : null;
        else if (t === "b") val = v === "1";
        else if (v != null) val = Number(v);
        if (val !== null && val !== "") any = true;
        row[c] = val;
      }
      if (!any) {
        blank++;
        if (opts.maxBlankRows && blank > opts.maxBlankRows) break;
        continue;
      }
      blank = 0;
      rows[r] = row;
    }
    // compact (keep row order, drop holes)
    return { name, rows: rows.filter(Boolean) };
  });
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
const colName = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

/** One-sheet workbook. First row is bold and frozen. */
export function writeXlsx(sheetName: string, rows: Cell[][], colWidths?: number[]): Uint8Array {
  const sheetRows = rows
    .map((r, ri) =>
      `<row r="${ri + 1}">` +
      r.map((v, ci) => {
        const ref = `${colName(ci)}${ri + 1}`;
        const s = ri === 0 ? ' s="1"' : "";
        if (v == null || v === "") return "";
        if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
        if (typeof v === "boolean") return `<c r="${ref}" t="b"${s}><v>${v ? 1 : 0}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
      }).join("") + "</row>")
    .join("");
  const cols = colWidths?.length
    ? `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetRows}</sheetData></worksheet>`),
  };
  return zipSync(files, { level: 6 });
}
