"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Sparkles, X } from "lucide-react";
import { partHistory, type PartHistory } from "@/lib/data";
import { PartEvolution } from "@/components/Charts";
import { Skeleton, Streak, TrendPill } from "@/components/ui/bits";
import { cx, dateLabel, num, short, signed } from "@/lib/format";

export default function PartDrawer({ partId, onClose, onAsk }: { partId: number | null; onClose: () => void; onAsk?: (q: string) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <AnimatePresence>
      {partId != null && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-scrim/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside role="dialog" aria-modal className="fixed inset-y-0 right-0 z-50 w-full max-w-[760px] overflow-y-auto border-l border-line bg-page shadow-pop"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}>
            <PartDetail partId={partId} onClose={onClose} onAsk={onAsk} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function PartDetail({ partId, onClose, onAsk }: { partId: number; onClose?: () => void; onAsk?: (q: string) => void }) {
  const [h, setH] = useState<PartHistory | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    setH(null);
    partHistory(partId).then(setH).catch(() => setH(null));
  }, [partId]);

  const snaps = h?.snapshots ?? [];
  const last = snaps.at(-1);
  const prev = snaps.at(-2);
  const periods = last?.lines.map((l) => l.period) ?? [];
  // the biggest single movement on this part (for the "matrix" color scale)
  const maxMove = Math.max(1, ...periods.flatMap((p) => snaps.slice(1).map((s, i) => Math.abs(qty(s, p) - qty(snaps[i], p)))));

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-panel/95 px-6 py-4 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Part</div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-xl font-semibold text-navy">{h?.part.part_no ?? "…"}</h2>
            {last?.trend && last.trend !== "Baseline" && <TrendPill trend={last.trend} />}
            {last?.streak ? <Streak n={last.streak} /> : null}
            {h && <button className="rounded p-1 text-muted hover:text-ink" title="Copy part number" onClick={() => navigator.clipboard.writeText(h.part.part_no)}><Copy className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="truncate text-sm text-slate">{h?.part.descr ?? " "}</div>
        </div>
        {onAsk && h && (
          <button className="btn-outline h-8 text-xs" onClick={() => onAsk(`Which months changed for part ${h.part.part_no}?`)}>
            <Sparkles className="h-3.5 w-3.5 text-teal" /> Which months changed?
          </button>
        )}
        {onClose && <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>}
      </div>

      {!h ? (
        <div className="space-y-3 p-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-60 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <div className="space-y-5 p-6">
          <div className="grid grid-cols-3 gap-3">
            <Stat label={`Total · ${last ? dateLabel(last.as_of) : ""}`} value={num(last?.total)} />
            <Stat label="Change vs previous" value={prev && last ? signed(Number(last.total) - Number(prev.total)) : "—"}
              tone={prev && last ? Math.sign(Number(last.total) - Number(prev.total)) : 0} />
            <Stat label="Snapshots on file" value={String(snaps.length)} />
          </div>

          <div className="card p-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm font-semibold">Forecast by month, each snapshot</div>
              <Legend snaps={snaps.map((s) => dateLabel(s.as_of))} />
            </div>
            <PartEvolution snapshots={snaps.map((s) => ({ label: dateLabel(s.as_of), lines: s.lines.map((l) => ({ period: l.period, qty: Number(l.qty) })) }))} focus={focus} />
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-line bg-panel-2 px-4 py-2.5 text-sm font-semibold">How each month moved</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="sticky left-0 bg-panel px-3 py-2 text-left font-medium">Snapshot</th>
                    {periods.map((p) => (
                      <th key={p} onMouseEnter={() => setFocus(p)} onMouseLeave={() => setFocus(null)}
                        className="whitespace-nowrap px-2 py-2 text-right font-medium">{p.replace(/^20(\d\d) M/, "$1·")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snaps.map((s, si) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="sticky left-0 whitespace-nowrap bg-panel px-3 py-1.5 font-medium">{dateLabel(s.as_of)}</td>
                      {periods.map((p) => {
                        const v = qty(s, p);
                        const d = si ? v - qty(snaps[si - 1], p) : 0;
                        const a = Math.min(0.85, 0.12 + (Math.abs(d) / maxMove) * 0.75);
                        return (
                          <td key={p} onMouseEnter={() => setFocus(p)} onMouseLeave={() => setFocus(null)}
                            title={si ? `${p}: ${num(v)} (${signed(d)})` : `${p}: ${num(v)}`}
                            className={cx("px-2 py-1.5 text-right tnum", focus === p && "outline outline-1 outline-amber")}
                            style={d ? { background: `rgb(var(--c-${d > 0 ? "up" : "down"}) / ${a * 0.35})` } : undefined}>
                            {v ? short(v) : <span className="text-muted">·</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-2 text-[11px] text-muted">Cells are shaded by how much that month moved since the snapshot before (green up, orange down).</div>
          </div>
        </div>
      )}
    </div>
  );
}

const qty = (s: PartHistory["snapshots"][number] | undefined, p: string) => Number(s?.lines.find((l) => l.period === p)?.qty ?? 0);

function Stat({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cx("mt-0.5 text-lg font-semibold tnum", tone > 0 && "text-up", tone < 0 && "text-down")}>{value}</div>
    </div>
  );
}

function Legend({ snaps }: { snaps: string[] }) {
  const n = snaps.length;
  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-slate">
      {snaps.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: i === n - 1 ? "rgb(var(--c-series-curr))" : i === n - 2 ? "rgb(var(--c-teal) / 0.75)" : "rgb(var(--c-series-prev) / 0.6)" }} />{s}
        </span>
      ))}
    </div>
  );
}
