"use client";

import { motion } from "motion/react";
import { Cpu, Sparkles, Star, X } from "lucide-react";
import type { AskResult } from "@/lib/ask";
import { filterChips, withoutKey, type Query } from "@/lib/query";
import { cx } from "@/lib/format";

// The answer to a question: Claude's (or the built-in engine's) answer line,
// what it understood (as removable chips), and a star to keep the question.
export default function AnswerCard({ a, onClear, onRefine, starred, onStar }: {
  a: AskResult; onClear: () => void; onRefine: (q: Query) => void; starred: boolean; onStar: () => void;
}) {
  const chips = filterChips(a.query);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      className="card relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber via-teal to-navy" />
      <div className="flex items-start gap-3 p-4 pl-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-soft text-teal">
          {a.engine === "claude" ? <Sparkles className="h-5 w-5" /> : <Cpu className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-medium text-slate">&ldquo;{a.question}&rdquo;</span>
            <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {a.engine === "claude" ? "Claude" : "Built-in"} · {(a.ms / 1000).toFixed(1)}s
            </span>
          </div>
          <Typed text={a.summary} />
          {a.interpretation && <div className="mt-1 text-xs text-muted">Showing: {a.interpretation}</div>}
          {a.notes.map((n) => <div key={n} className="mt-1 text-xs text-muted">{n}</div>)}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-slate">
                {c.label}
                <button onClick={() => onRefine(withoutKey(a.query, c.key))} className="text-muted hover:text-ink" aria-label={`Remove ${c.label}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
            <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-muted">{a.query.mode === "part" ? "By part" : "By month"}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onStar} className={cx("btn-ghost h-8 px-2", starred && "text-amber")} title={starred ? "Remove from favorites" : "Add to favorites"}>
            <Star className={cx("h-4 w-4", starred && "fill-current")} />
          </button>
          <button onClick={onClear} className="btn-ghost h-8 px-2" title="Clear the answer"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </motion.div>
  );
}

// the answer types itself out — quickly, and only once
function Typed({ text }: { text: string }) {
  return (
    <p className="mt-1 text-[15px] leading-relaxed text-ink">
      {text.split(" ").map((w, i) => (
        <motion.span key={`${i}-${w}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(1.2, i * 0.025) }}>{w} </motion.span>
      ))}
    </p>
  );
}
