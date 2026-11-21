"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/components/Workspace";
import { parseForecastWorkbook, type ParsedForecast } from "@/lib/importer";
import { cx, dateLabel, num, short } from "@/lib/format";

type Item = {
  key: string; file: File; status: "parsing" | "ready" | "importing" | "done" | "error";
  parsed?: ParsedForecast; asOf: string; error?: string;
  result?: { parts: number; lines: number; new_parts: number; removed_parts: number; db_ms: number; replaced: boolean };
};

export default function ImportsPage() {
  const { dataset, snapshots, canImport, reload } = useWorkspace();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const addFiles = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!/\.xlsx$/i.test(file.name)) {
        setItems((l) => [...l, { key: crypto.randomUUID(), file, status: "error", asOf: "", error: "Only .xlsx files can be imported." }]);
        continue;
      }
      const key = crypto.randomUUID();
      setItems((l) => [...l, { key, file, status: "parsing", asOf: "" }]);
      file.arrayBuffer().then((buf) => {
        // give the browser a beat to paint the "reading" state
        setTimeout(() => {
          try {
            const parsed = parseForecastWorkbook(buf, file.name);
            update(key, { status: "ready", parsed, asOf: parsed.asOf ?? new Date().toISOString().slice(0, 10) });
          } catch (e) {
            update(key, { status: "error", error: (e as Error).message });
          }
        }, 30);
      });
    }
  }, []);

  const importOne = async (it: Item) => {
    if (!it.parsed || !dataset) return;
    update(it.key, { status: "importing", error: undefined });
    const { data, error } = await supabase.rpc("import_snapshot", {
      p_dataset: dataset.id, p_as_of: it.asOf, p_label: dateLabel(it.asOf), p_file: it.file.name,
      p_periods: it.parsed.periods, p_rows: it.parsed.rows, p_parse_ms: it.parsed.ms,
    });
    if (error) update(it.key, { status: "error", error: error.message });
    else update(it.key, { status: "done", result: data });
  };

  const importAll = async () => {
    // oldest first, so each snapshot is compared with the one before it
    const ready = items.filter((i) => i.status === "ready").sort((a, b) => a.asOf.localeCompare(b.asOf));
    for (const it of ready) await importOne(it);
    await reload();
  };

  const removeSnapshot = async (id: number, label: string) => {
    if (!confirm(`Delete the ${label} snapshot? Its forecast lines are removed and the next snapshot is recompared.`)) return;
    const { error } = await supabase.rpc("delete_snapshot", { p_id: id });
    if (error) alert(error.message);
    await reload();
  };

  const ready = items.filter((i) => i.status === "ready").length;
  const exists = (d: string) => snapshots.some((s) => s.as_of === d);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-5 py-8 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
        <p className="mt-1 text-sm text-slate">Each forecast file becomes a dated snapshot of {dataset ? <b>{dataset.customer} · {dataset.name}</b> : "your dataset"}. Re-importing a date replaces it.</p>
      </div>

      {canImport ? (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          onClick={() => input.current?.click()}
          className={cx("relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition",
            drag ? "border-amber bg-amber-soft" : "border-line-strong bg-panel hover:border-teal hover:bg-teal-soft/40")}>
          <input ref={input} type="file" accept=".xlsx" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <motion.div animate={{ y: drag ? -4 : 0, scale: drag ? 1.06 : 1 }} className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-navy text-white shadow-lift">
            <UploadCloud className="h-7 w-7" />
          </motion.div>
          <div className="mt-4 text-[15px] font-semibold">Drop forecast files here, or click to choose</div>
          <div className="mt-1 text-sm text-slate">Excel files with a <b>PIVOT</b> sheet. Several at once is fine — they&rsquo;re read right here in your browser first.</div>
        </div>
      ) : (
        <div className="card p-5 text-sm text-slate">Only administrators and managers can import forecasts.</div>
      )}

      <AnimatePresence>
        {items.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-panel-2 px-4 py-3">
              <h2 className="text-[15px] font-semibold">Ready to import</h2>
              <div className="flex gap-2">
                <button className="btn-ghost h-8 text-xs" onClick={() => setItems([])}>Clear</button>
                <button className="btn-primary h-8 text-xs" disabled={!ready} onClick={importAll}>Import {ready > 1 ? `all ${ready}` : ""}</button>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {items.map((it) => (
                <li key={it.key} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <StatusIcon s={it.status} />
                  <div className="min-w-[220px] flex-1">
                    <div className="truncate text-sm font-medium">{it.file.name}</div>
                    {it.parsed && (
                      <div className="mt-0.5 text-xs text-slate">
                        {num(it.parsed.parts)} parts · {it.parsed.periods.length} periods ({it.parsed.periods[0]} → {it.parsed.periods.at(-1)}) ·
                        total {short(it.parsed.total)} · {num(it.parsed.withDescr)} descriptions · read in {it.parsed.ms} ms
                      </div>
                    )}
                    {it.parsed?.warnings.map((w) => <div key={w} className="text-xs text-amber-ink">{w}</div>)}
                    {it.error && <div className="mt-0.5 text-xs text-down">{it.error}</div>}
                    {it.result && (
                      <div className="mt-0.5 text-xs text-up">
                        {it.result.replaced ? "Replaced" : "Imported"} {num(it.result.lines)} forecast lines in {it.result.db_ms} ms ·
                        {" "}{it.result.new_parts} new parts · {it.result.removed_parts} removed
                      </div>
                    )}
                  </div>
                  {(it.status === "ready" || it.status === "error") && it.parsed && (
                    <label className="text-xs text-slate">
                      Snapshot date
                      <input type="date" className="input mt-0.5 h-8 w-40 py-1" value={it.asOf} onChange={(e) => update(it.key, { asOf: e.target.value })} />
                      {exists(it.asOf) && <span className="mt-0.5 block text-[11px] text-amber-ink">Replaces the existing snapshot</span>}
                    </label>
                  )}
                  {it.status === "ready" && <button className="btn-outline h-8 text-xs" onClick={async () => { await importOne(it); await reload(); }}>Import</button>}
                  {it.status !== "importing" && (
                    <button className="rounded p-1 text-muted hover:text-ink" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} aria-label="Remove"><X className="h-4 w-4" /></button>
                  )}
                  {it.status === "importing" && <div className="skeleton h-1 w-full rounded bg-teal-soft" />}
                </li>
              ))}
            </ul>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="card overflow-hidden">
        <div className="border-b border-line bg-panel-2 px-4 py-3 text-[15px] font-semibold">Snapshots on file</div>
        {!snapshots.length ? (
          <div className="px-4 py-10 text-center text-sm text-muted">No snapshots yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted">
              <tr>
                {["As of", "File", "Parts", "Total qty", "Up", "Down", "New", "Removed", "Import time", ""].map((h) => (
                  <th key={h} className={cx("px-4 py-2 font-semibold", ["Parts", "Total qty", "Up", "Down", "New", "Removed", "Import time"].includes(h) ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...snapshots].reverse().map((s, i) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">
                    {dateLabel(s.as_of)} {i === 0 && <span className="ml-1 rounded-full bg-teal-soft px-1.5 py-0.5 text-[10px] font-semibold text-teal">LATEST</span>}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-2.5 text-slate" title={s.file_name ?? ""}>{s.file_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tnum">{num(s.part_count)}</td>
                  <td className="px-4 py-2.5 text-right tnum">{short(s.total_qty)}</td>
                  <td className="px-4 py-2.5 text-right tnum text-up">{i === snapshots.length - 1 ? "—" : num(s.up)}</td>
                  <td className="px-4 py-2.5 text-right tnum text-down">{i === snapshots.length - 1 ? "—" : num(s.down)}</td>
                  <td className="px-4 py-2.5 text-right tnum text-new">{i === snapshots.length - 1 ? "—" : num(s.new)}</td>
                  <td className="px-4 py-2.5 text-right tnum text-removed">{i === snapshots.length - 1 ? "—" : num(s.removed)}</td>
                  <td className="px-4 py-2.5 text-right tnum text-muted">{s.import_ms != null ? `${(s.import_ms / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canImport && <button className="rounded p-1 text-muted hover:text-down" title="Delete snapshot" onClick={() => removeSnapshot(s.id, dateLabel(s.as_of))}><Trash2 className="h-4 w-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatusIcon({ s }: { s: Item["status"] }) {
  if (s === "parsing" || s === "importing") return <Loader2 className="h-5 w-5 animate-spin text-teal" />;
  if (s === "done") return <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }}><CheckCircle2 className="h-5 w-5 text-up" /></motion.span>;
  if (s === "error") return <AlertTriangle className="h-5 w-5 text-down" />;
  return <FileSpreadsheet className="h-5 w-5 text-navy" />;
}
