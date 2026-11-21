"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Clock, Mic, Play, Star, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/components/Workspace";
import { useQuestions } from "@/components/QuestionRail";
import { ago, cx, num } from "@/lib/format";

type Row = { id: number; text: string; source: string; result_count: number | null; asked_at: string; engine: string | null; user_id: string | null; summary: string | null };

export default function QuestionsPage() {
  const { canImport } = useWorkspace();
  const qs = useQuestions();
  const [tab, setTab] = useState<"mine" | "fav" | "zero">("mine");
  const [zero, setZero] = useState<Row[]>([]);
  const [mine, setMine] = useState<Row[]>([]);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    const [a, b] = await Promise.all([
      supabase.from("question").select("id,text,source,result_count,asked_at,engine,user_id,summary").eq("user_id", u.user?.id ?? "").order("asked_at", { ascending: false }).limit(500),
      supabase.from("question").select("id,text,source,result_count,asked_at,engine,user_id,summary").eq("result_count", 0).order("asked_at", { ascending: false }).limit(500),
    ]);
    setMine((a.data as Row[]) ?? []);
    setZero((b.data as Row[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const rows: Row[] = tab === "mine" ? mine : tab === "zero" ? zero
    : qs.saved.map((s) => ({ id: s.id, text: s.text, source: "saved", result_count: null, asked_at: "", engine: null, user_id: null, summary: s.name !== s.text ? s.name : null }));

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-5 py-8 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Questions</h1>
        <p className="mt-1 text-sm text-slate">Everything you&rsquo;ve asked, your favorites, and the questions that came back empty — the best guide to which words to add to the Dictionary.</p>
      </div>
      <div className="flex gap-1 rounded-xl bg-sunken p-1 text-sm font-medium sm:w-fit">
        {([["mine", "My history", Clock, mine.length], ["fav", "Favorites", Star, qs.saved.length], ["zero", canImport ? "Found nothing (team)" : "Found nothing", CircleAlert, zero.length]] as const).map(([k, label, Icon, n]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition", tab === k ? "bg-panel shadow-card" : "text-slate hover:text-ink")}>
            <Icon className="h-4 w-4" />{label}<span className="rounded-full bg-sunken px-1.5 text-[11px] text-muted">{n}</span>
          </button>
        ))}
      </div>
      <div className="card divide-y divide-line overflow-hidden">
        {!rows.length && <div className="px-4 py-12 text-center text-sm text-muted">Nothing here yet.</div>}
        {rows.map((r) => (
          <div key={`${tab}-${r.id}`} className="group flex items-start gap-3 px-4 py-3 hover:bg-panel-2">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{r.text}</div>
              {r.summary && <div className="mt-0.5 line-clamp-2 text-xs text-slate">{r.summary}</div>}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                {r.asked_at && <span>{ago(r.asked_at)}</span>}
                {r.source === "voice" && <span className="inline-flex items-center gap-0.5"><Mic className="h-3 w-3" /> voice</span>}
                {r.engine && <span className="rounded bg-sunken px-1">{r.engine === "claude" ? "Claude" : r.engine === "base44" ? "Base44 POC" : "Built-in"}</span>}
                {r.result_count != null && <span className={r.result_count ? "" : "rounded bg-down-soft px-1 text-down"}>{r.result_count ? `${num(r.result_count)} results` : "no results"}</span>}
              </div>
            </div>
            <Link href={`/?ask=${encodeURIComponent(r.text)}`} className="btn-outline h-8 text-xs"><Play className="h-3.5 w-3.5" /> Ask again</Link>
            <button onClick={() => qs.star(r.text)} className={cx("rounded p-1.5", qs.isStarred(r.text) ? "text-amber" : "text-muted hover:text-amber")} title="Favorite">
              <Star className={cx("h-4 w-4", qs.isStarred(r.text) && "fill-current")} />
            </button>
            {tab !== "fav" && (
              <button onClick={async () => { await supabase.from("question").delete().eq("id", r.id); load(); }} className="rounded p-1.5 text-muted opacity-0 hover:text-down group-hover:opacity-100" title="Delete"><Trash2 className="h-4 w-4" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
