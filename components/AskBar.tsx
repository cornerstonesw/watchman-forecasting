"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Loader2, Mic, Sparkles, Square } from "lucide-react";
import { useSpeech } from "@/lib/useSpeech";
import { normalizeSpoken } from "@/lib/understand";
import { cx } from "@/lib/format";

const SUGGESTIONS = [
  "Which parts are trending up?",
  "Biggest drops this week",
  "Capacitors that changed by 10% or more",
  "New and removed parts",
  "What got pulled in or pushed out?",
  "Demand above 10,000 in December 2026",
];

export default function AskBar({ onAsk, busy, value, setValue }: {
  onAsk: (q: string, source: "typed" | "voice") => void;
  busy: boolean;
  value: string;
  setValue: (v: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const speech = useSpeech((text) => {
    const q = normalizeSpoken(text);
    setValue(q);
    onAsk(q, "voice");
  });

  // ⌘K / Ctrl+K or "/" focuses the ask bar from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = value.trim();
    if (q && !busy) onAsk(q, "typed");
  };

  const listening = speech.listening;
  return (
    <div className="w-full">
      <form onSubmit={submit}
        className={cx("relative flex items-center gap-2 rounded-2xl border bg-panel/95 p-1.5 pl-4 shadow-lift backdrop-blur transition",
          focused || listening ? "border-amber shadow-glow" : "border-white/10")}>
        <Sparkles className={cx("h-5 w-5 shrink-0 transition", busy ? "animate-pulse text-amber" : "text-teal")} />
        <input ref={input} value={listening ? speech.interim || "" : value} onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={listening ? "Listening… ask about parts, trends, months" : "Ask anything — “which capacitors are trending up?”"}
          aria-label="Ask a question about the forecast"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none" />
        {!listening && !busy && (
          <kbd className="hidden select-none rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted lg:block">⌘K</kbd>
        )}
        {speech.supported && (
          <button type="button" onClick={() => (listening ? speech.stop() : speech.start())} disabled={busy}
            title={listening ? "Stop" : "Ask by voice"} aria-label={listening ? "Stop listening" : "Ask by voice"}
            className={cx("relative grid h-11 w-11 shrink-0 place-items-center rounded-xl transition",
              listening ? "bg-amber text-chrome" : "bg-sunken text-slate hover:bg-teal-soft hover:text-teal")}>
            {listening && (
              <>
                <span className="absolute inset-0 rounded-xl bg-amber/60 animate-ping2" />
                <span className="absolute inset-0 rounded-xl bg-amber/40" style={{ transform: `scale(${1 + speech.level * 0.6})`, transition: "transform 80ms linear" }} />
              </>
            )}
            {listening ? <Square className="relative h-4 w-4 fill-current" /> : <Mic className="relative h-5 w-5" />}
          </button>
        )}
        <button type="submit" disabled={busy || !value.trim() || listening}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-amber px-4 text-sm font-semibold text-chrome transition hover:brightness-105 disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
          <span className="hidden sm:inline">Ask</span>
        </button>
      </form>

      <AnimatePresence>
        {listening && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-2 flex items-center gap-2 pl-2 text-xs text-on-chrome-dim">
            <Wave level={speech.level} /> Speak your question — part numbers can be read digit by digit (“one one four eight dash A…”).
          </motion.div>
        )}
      </AnimatePresence>
      {speech.error && <div className="mt-2 pl-2 text-xs text-amber">{speech.error}</div>}

      {!listening && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" disabled={busy} onClick={() => { setValue(s); onAsk(s, "typed"); }}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-on-chrome-dim transition hover:border-amber/60 hover:bg-white/10 hover:text-white">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Wave({ level }: { level: number }) {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[0.5, 0.9, 0.65, 1, 0.7, 0.45].map((k, i) => (
        <span key={i} className="w-[3px] rounded-full bg-amber transition-[height] duration-75"
          style={{ height: `${Math.max(3, 16 * Math.min(1, level * k * 1.6 + 0.12 * ((i % 3) + 1)))}px` }} />
      ))}
    </span>
  );
}
