"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, RotateCcw, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/components/Workspace";
import { useToast } from "@/components/ui/bits";
import { cx } from "@/lib/format";

type Field = { id: number; tenant_id: string | null; key: string; label: string; kind: string; synonyms: string[]; allowed: string[]; notes: string; filterable: boolean; sort_order: number };

// The semantic layer: every field the questions can use, and the words people
// use for it. Claude reads this table on every question. Admins add words; a
// change is saved as this company's own version of the field (the engine's
// default stays underneath — "Reset" goes back to it).
export default function DictionaryPage() {
  const { isAdmin, who } = useWorkspace();
  const [fields, setFields] = useState<Field[]>([]);
  const { toast, toastNode } = useToast();

  const load = async () => {
    const { data } = await supabase.from("field_def").select("*").order("sort_order");
    const byKey = new Map<string, Field>();
    for (const f of (data as Field[]) ?? []) if (!byKey.has(f.key) || f.tenant_id) byKey.set(f.key, f);
    setFields([...byKey.values()].sort((a, b) => a.sort_order - b.sort_order));
  };
  useEffect(() => { load(); }, []);

  const save = async (f: Field, patch: Partial<Field>) => {
    const tenant = who?.member?.tenant_id;
    if (!tenant) return;
    const row = { tenant_id: tenant, key: f.key, label: f.label, kind: f.kind, synonyms: f.synonyms, allowed: f.allowed, notes: f.notes, filterable: f.filterable, sort_order: f.sort_order, ...patch };
    const { error } = f.tenant_id
      ? await supabase.from("field_def").update(patch).eq("id", f.id)
      : await supabase.from("field_def").insert(row);
    if (error) toast(error.message); else { toast("Saved — the next question uses it."); load(); }
  };
  const reset = async (f: Field) => {
    if (!f.tenant_id) return;
    await supabase.from("field_def").delete().eq("id", f.id);
    toast("Back to the Watchman default.");
    load();
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-5 py-8 md:px-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><BookOpen className="h-6 w-6 text-teal" /> Field dictionary</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          The words your team uses for each field. Every question — typed or spoken — is read against this list, so adding the
          word someone actually used (see <b>Questions → Found nothing</b>) teaches Watchman immediately.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => <FieldCard key={f.key} f={f} editable={isAdmin} onSave={(p) => save(f, p)} onReset={() => reset(f)} />)}
      </div>
      {toastNode}
    </div>
  );
}

function FieldCard({ f, editable, onSave, onReset }: { f: Field; editable: boolean; onSave: (p: Partial<Field>) => void; onReset: () => void }) {
  const [word, setWord] = useState("");
  const [notes, setNotes] = useState(f.notes);
  const [editing, setEditing] = useState(false);
  useEffect(() => setNotes(f.notes), [f.notes]);
  return (
    <section className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">{f.label}</h2>
            <code className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-slate">{f.key}</code>
            <span className="text-[11px] uppercase tracking-wide text-muted">{f.kind}</span>
          </div>
          {f.tenant_id && <div className="mt-0.5 text-[11px] text-teal">Customized for your company</div>}
        </div>
        {editable && f.tenant_id && <button onClick={onReset} className="btn-ghost h-7 text-xs" title="Back to default"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>}
      </div>
      {f.allowed.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">{f.allowed.map((a) => <span key={a} className="rounded-md bg-navy/10 px-1.5 py-0.5 text-[11px] font-medium text-navy">{a}</span>)}</div>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {f.synonyms.map((s) => (
          <span key={s} className="group inline-flex items-center gap-1 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[12px] text-slate">
            {s}
            {editable && <button className="hidden text-muted hover:text-down group-hover:inline" onClick={() => onSave({ synonyms: f.synonyms.filter((x) => x !== s) })}><X className="h-3 w-3" /></button>}
          </span>
        ))}
        {editable && (
          <form onSubmit={(e) => { e.preventDefault(); const w = word.trim().toLowerCase(); if (w && !f.synonyms.includes(w)) onSave({ synonyms: [...f.synonyms, w] }); setWord(""); }}
            className="inline-flex items-center">
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="add a word…" className="h-6 w-28 rounded-full border border-dashed border-line-strong bg-transparent px-2 text-[12px] focus:border-amber focus:outline-none" />
            {word && <button className="ml-1 text-teal"><Plus className="h-4 w-4" /></button>}
          </form>
        )}
      </div>
      {editing ? (
        <div className="mt-3">
          <textarea className="input min-h-[84px] text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="mt-1.5 flex justify-end gap-1">
            <button className="btn-ghost h-7 text-xs" onClick={() => { setNotes(f.notes); setEditing(false); }}>Cancel</button>
            <button className="btn-primary h-7 text-xs" onClick={() => { onSave({ notes }); setEditing(false); }}>Save</button>
          </div>
        </div>
      ) : (
        <p onClick={() => editable && setEditing(true)} className={cx("mt-3 text-xs leading-relaxed text-muted", editable && "cursor-text hover:text-slate")}>{f.notes}</p>
      )}
    </section>
  );
}
