"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileSpreadsheet, Info, Loader2 } from "lucide-react";
import { useWorkspace } from "@/components/Workspace";
import AskBar from "@/components/AskBar";
import CompareBar from "@/components/CompareBar";
import KpiCards, { buildKpis, type Kpi } from "@/components/KpiCards";
import { MovementByPeriod, Waterfall } from "@/components/Charts";
import ForecastGrid from "@/components/ForecastGrid";
import PartDrawer from "@/components/PartDrawer";
import AnswerCard from "@/components/AnswerCard";
import QuestionRail, { useQuestions } from "@/components/QuestionRail";
import { Skeleton, useToast } from "@/components/ui/bits";
import { summary as loadSummary, type Summary } from "@/lib/data";
import { ask, type AskResult } from "@/lib/ask";
import { EMPTY_QUERY, type Query } from "@/lib/query";
import { dateLabel } from "@/lib/format";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function Dashboard() {
  const { who, dataset, snapshots, base, curr, loading, canImport } = useWorkspace();
  const [s, setS] = useState<Summary | null>(null);
  const [query, setQuery] = useState<Query>(EMPTY_QUERY);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<string | null>(null);
  const [part, setPart] = useState<number | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const qs = useQuestions();
  const { toast, toastNode } = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const askedFromLink = useRef(false);

  useEffect(() => {
    if (!base || !curr) return;
    setS(null);
    loadSummary(base.id, curr.id).then(setS).catch(() => setS(null));
  }, [base, curr]);

  const kpis = useMemo(() => (s ? buildKpis(s, snapshots) : []), [s, snapshots]);
  const labels = { base: base ? dateLabel(base.as_of) : "", curr: curr ? dateLabel(curr.as_of) : "" };

  const onAsk = useCallback(async (q: string, source: "typed" | "voice" | "saved" = "typed") => {
    if (!base || !curr || !s) return;
    setAsking(true);
    setText(q);
    try {
      const r = await ask({ question: q, base: base.id, curr: curr.id, previous: answer?.query ?? null, source, labels, horizon: s.periods });
      setAnswer(r);
      setQuery(r.query);
      setActiveKpi(null);
      setActivePeriod(null);
      qs.reload();
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      toast(`Couldn't answer that: ${(e as Error).message}`);
    } finally {
      setAsking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, curr, s, answer]);

  // "Ask again" links from the Questions page: /?ask=…
  useEffect(() => {
    const q = params.get("ask");
    if (!q || !s || askedFromLink.current) return;
    askedFromLink.current = true;
    onAsk(q, "saved");
    const sp = new URLSearchParams(params.toString());
    sp.delete("ask");
    router.replace(sp.toString() ? `?${sp}` : "/", { scroll: false });
  }, [params, s, onAsk, router]);

  const pickKpi = (k: Kpi) => {
    if (activeKpi === k.id) { setActiveKpi(null); setQuery(EMPTY_QUERY); return; }
    setActiveKpi(k.id);
    setActivePeriod(null);
    setAnswer(null);
    setQuery(k.query ?? EMPTY_QUERY);
  };
  const pickPeriod = (p: string) => {
    if (activePeriod === p) { setActivePeriod(null); setQuery(EMPTY_QUERY); return; }
    setActivePeriod(p);
    setActiveKpi(null);
    setAnswer(null);
    setQuery({ filter: { periods: [p], changed_only: true }, mode: "line", sort: "impact", desc: true });
  };

  if (loading) return <div className="grid h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted" /></div>;
  if (!who?.member) return <NoAccess />;

  const gridTitle = answer ? "Answer" : activeKpi ? kpis.find((k) => k.id === activeKpi)?.title ?? "Forecast" : activePeriod ? `Changes in ${activePeriod}` : "All forecast changes";

  return (
    <div className="pb-16">
      <header className="horizon relative overflow-hidden px-5 pb-16 pt-7 md:px-8">
        <div className="horizon-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-[1500px]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-amber">{dataset ? `${dataset.customer} · ${dataset.name}` : "Watchman"}</div>
              <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight text-white">{greeting()}, {who.member.first_name}.</h1>
            </div>
            <CompareBar />
          </div>
          <div className="mt-5 max-w-4xl">
            {snapshots.length >= 2 ? (
              <AskBar onAsk={(q, src) => onAsk(q, src)} busy={asking} value={text} setValue={setText} />
            ) : (
              <EmptyHero count={snapshots.length} canImport={canImport} />
            )}
          </div>
        </div>
      </header>

      {snapshots.length >= 2 && base && curr && (
        <div className="relative mx-auto -mt-10 max-w-[1500px] space-y-5 px-5 md:px-8">
          {s ? <KpiCards kpis={kpis} active={activeKpi} onPick={pickKpi} /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)}</div>
          )}

          {answer && (
            <AnswerCard a={answer} onClear={() => { setAnswer(null); setQuery(EMPTY_QUERY); setText(""); }}
              onRefine={(q) => { setAnswer({ ...answer, query: q }); setQuery(q); }}
              starred={qs.isStarred(answer.question)} onStar={() => qs.star(answer.question)} />
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <ChartCard title="Where the forecast moved" hint="Increases and decreases by forecast month — click a month to see its changes.">
                  {s ? <MovementByPeriod s={s} onPeriod={pickPeriod} active={activePeriod} /> : <Skeleton className="h-[230px]" />}
                </ChartCard>
                <ChartCard title="Forecast waterfall" hint={`Total demand ${labels.base} → ${labels.curr}, over the months both snapshots cover.`}>
                  {s ? <Waterfall s={s} /> : <Skeleton className="h-[230px]" />}
                </ChartCard>
              </div>
              <div id="results" className="scroll-mt-4">
                <ForecastGrid base={base.id} curr={curr.id} query={query} title={gridTitle} labels={labels} customer={dataset?.customer ?? ""}
                  setQuery={(q) => { setQuery(q); if (answer) setAnswer({ ...answer, query: q }); }} onOpenPart={setPart} />
              </div>
            </div>
            <div className="xl:sticky xl:top-5 xl:h-[calc(100vh-40px)]">
              <QuestionRail qs={qs} busy={asking} onRun={(q) => onAsk(q, "saved")} />
            </div>
          </div>
        </div>
      )}

      <PartDrawer partId={part} onClose={() => setPart(null)} onAsk={(q) => { setPart(null); onAsk(q); }} />
      {toastNode}
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span title={hint} className="text-muted"><Info className="h-3.5 w-3.5" /></span>
      </div>
      {children}
    </section>
  );
}

function EmptyHero({ count, canImport }: { count: number; canImport: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-on-chrome backdrop-blur">
      <div className="text-lg font-semibold text-white">{count === 0 ? "Let’s load your first forecast." : "One snapshot in — one more to compare."}</div>
      <p className="mt-1 max-w-2xl text-sm text-on-chrome-dim">
        Every forecast file you import becomes a dated snapshot. With two or more, Watchman shows what moved, what&rsquo;s trending,
        and answers questions in plain English — typed or spoken.
      </p>
      {canImport && <Link href="/imports" className="btn-amber mt-4 h-10 px-4"><FileSpreadsheet className="h-4 w-4" /> Import forecast files</Link>}
    </div>
  );
}

function NoAccess() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-xl font-semibold">No Watchman access</h1>
      <p className="mt-2 text-sm text-slate">Your sign-in worked, but it isn&rsquo;t linked to an active Watchman account. Ask your administrator to add you.</p>
      <a href="/auth/signout" className="btn-outline mt-5">Sign out</a>
    </div>
  );
}
