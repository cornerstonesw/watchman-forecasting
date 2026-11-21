"use client";

import { ArrowRight, CalendarRange } from "lucide-react";
import { useWorkspace } from "@/components/Workspace";
import { dateLabel } from "@/lib/format";

// "Comparing  Apr 13, 2026  →  Apr 20, 2026" — pick any two snapshots.
export default function CompareBar() {
  const { snapshots, base, curr, setPair } = useWorkspace();
  if (!curr) return null;
  const days = base ? Math.round((+new Date(curr.as_of) - +new Date(base.as_of)) / 86_400_000) : 0;
  const sel = "h-8 cursor-pointer appearance-none rounded-lg border border-white/15 bg-white/10 pl-2.5 pr-7 text-sm font-medium text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber/50 bg-no-repeat bg-[right_0.5rem_center] bg-[length:12px]";
  const caret = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5' fill='none' stroke='%239DB2C8' stroke-width='1.5'/%3E%3C/svg%3E\")" };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-on-chrome-dim">
      <CalendarRange className="h-4 w-4" />
      <span>Comparing</span>
      <select className={sel} style={caret} value={base?.id ?? ""} disabled={snapshots.length < 2}
        onChange={(e) => setPair(Number(e.target.value), curr.id)} aria-label="Base snapshot">
        {snapshots.filter((s) => s.as_of < curr.as_of).map((s) => <option key={s.id} value={s.id} className="text-ink">{dateLabel(s.as_of)}</option>)}
        {!base && <option value="">—</option>}
      </select>
      <ArrowRight className="h-4 w-4 text-amber" />
      <select className={sel} style={caret} value={curr.id}
        onChange={(e) => {
          const c = snapshots.find((s) => s.id === Number(e.target.value))!;
          const b = base && base.as_of < c.as_of ? base : [...snapshots].reverse().find((s) => s.as_of < c.as_of);
          setPair(b?.id ?? c.id, c.id);
        }} aria-label="Current snapshot">
        {snapshots.filter((s) => !base || s.as_of > base.as_of).map((s) => <option key={s.id} value={s.id} className="text-ink">{dateLabel(s.as_of)}</option>)}
      </select>
      {base && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{days} days apart · {snapshots.length} snapshots on file</span>}
    </div>
  );
}
