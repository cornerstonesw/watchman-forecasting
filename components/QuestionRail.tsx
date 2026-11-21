"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, History, Mic, Star, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/components/Workspace";
import { ago, cx } from "@/lib/format";

export type Saved = { id: number; name: string; text: string; is_favorite: boolean };
type Asked = { id: number; text: string; source: string; result_count: number | null; asked_at: string; engine: string | null };

// Favorites, recent questions and the full history — any question can be starred.
export function useQuestions() {
  const { who } = useWorkspace();
  const [saved, setSaved] = useState<Saved[]>([]);
  const [history, setHistory] = useState<Asked[]>([]);
  const reload = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [s, h] = await Promise.all([
      supabase.from("saved_question").select("id,name,text,is_favorite").order("created_at", { ascending: false }),
      supabase.from("question").select("id,text,source,result_count,asked_at,engine").eq("user_id", u.user.id).order("asked_at", { ascending: false }).limit(200),
    ]);
    setSaved((s.data as Saved[]) ?? []);
    setHistory((h.data as Asked[]) ?? []);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const star = async (text: string, name?: string) => {
    const tenant = who?.member?.tenant_id;
    const { data: u } = await supabase.auth.getUser();
    if (!tenant || !u.user) return;
    const existing = saved.find((s) => s.text === text);
    if (existing) await supabase.from("saved_question").delete().eq("id", existing.id);
    else await supabase.from("saved_question").insert({ tenant_id: tenant, user_id: u.user.id, text, name: name ?? text.slice(0, 80) });
    reload();
  };
  const forget = async (id: number) => {
    await supabase.from("question").delete().eq("id", id);
    reload();
  };
  return { saved, history, reload, star, forget, isStarred: (t: string) => saved.some((s) => s.text === t) };
}

export default function QuestionRail({ qs, onRun, busy }: { qs: ReturnType<typeof useQuestions>; onRun: (q: string) => void; busy: boolean }) {
  const [tab, setTab] = useState<"fav" | "recent" | "all">("fav");
  const recent = [...new Map(qs.history.map((h) => [h.text.toLowerCase(), h])).values()].slice(0, 12);
  const list = tab === "fav" ? qs.saved.map((s) => ({ id: s.id, text: s.text, meta: "" as string, zero: false, voice: false, hid: 0 }))
    : (tab === "recent" ? recent : qs.history).map((h) => ({ id: h.id, text: h.text, meta: ago(h.asked_at), zero: h.result_count === 0, voice: h.source === "voice", hid: h.id }));

  return (
    <aside className="card flex h-full min-h-[320px] flex-col overflow-hidden">
      <div className="flex border-b border-line bg-panel-2 p-1 text-xs font-medium">
        {([["fav", "Favorites", Star], ["recent", "Recent", Clock], ["all", "History", History]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cx("flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition", tab === k ? "bg-panel text-ink shadow-card" : "text-slate hover:text-ink")}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {!list.length && (
          <div className="px-4 py-10 text-center text-xs text-muted">
            {tab === "fav" ? "Star a question to keep it here." : "Questions you ask show up here."}
          </div>
        )}
        {list.map((item) => (
          <div key={`${tab}-${item.id}`} className="group flex items-start gap-1 rounded-lg px-2 py-1.5 hover:bg-sunken">
            <button disabled={busy} onClick={() => onRun(item.text)} className="min-w-0 flex-1 text-left">
              <div className="line-clamp-2 text-[13px] leading-snug text-ink">{item.text}</div>
              {(item.meta || item.zero) && (
                <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                  {item.voice && <Mic className="h-3 w-3" />}{item.meta}
                  {item.zero && <span className="rounded bg-down-soft px-1 text-down">no results</span>}
                </div>
              )}
            </button>
            <button onClick={() => qs.star(item.text)} title={qs.isStarred(item.text) ? "Remove from favorites" : "Add to favorites"}
              className={cx("rounded p-1 transition", qs.isStarred(item.text) ? "text-amber" : "text-muted opacity-0 hover:text-amber group-hover:opacity-100")}>
              <Star className={cx("h-3.5 w-3.5", qs.isStarred(item.text) && "fill-current")} />
            </button>
            {tab === "all" && (
              <button onClick={() => qs.forget(item.hid)} title="Delete" className="rounded p-1 text-muted opacity-0 hover:text-down group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
