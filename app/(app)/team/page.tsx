"use client";

import { FormEvent, useEffect, useState } from "react";
import { Laptop, Loader2, Plus, ShieldCheck, UserPlus, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/components/Workspace";
import { useToast } from "@/components/ui/bits";
import type { Member } from "@/lib/data";
import { ago, cx } from "@/lib/format";

type Settings = { tenant_id: string; two_step_required: boolean; trusted_device_days: number; idle_timeout_minutes: number; sign_out_on_browser_close: boolean };
type Device = { id: string; member_id: string; device_name: string; trusted_at: string; last_used_at: string | null; expires_at: string };

const ROLE_STYLE = { admin: "bg-shift-soft text-shift", manager: "bg-teal-soft text-teal", user: "bg-sunken text-slate" } as const;

// Team & security (administrators): who has access, their role, two-step
// status, trusted devices, and the company's session rules.
export default function TeamPage() {
  const { isAdmin, who } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [adding, setAdding] = useState(false);
  const { toast, toastNode } = useToast();

  const load = async () => {
    const [m, s, d] = await Promise.all([
      supabase.from("member").select("*").order("last_name"),
      supabase.from("security_settings").select("*").maybeSingle(),
      supabase.rpc("my_trusted_devices"),
    ]);
    setMembers((m.data as Member[]) ?? []);
    setSettings(s.data as Settings | null);
    setDevices((d.data as Device[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  if (!isAdmin) return <div className="mx-auto mt-20 max-w-md text-center text-sm text-slate">Only administrators can manage the team.</div>;

  const updateMember = async (id: string, patch: Partial<Member>) => {
    if (id === who?.member?.id && (patch.role && patch.role !== "admin" || patch.is_active === false)) {
      if (!confirm("This changes your own access. Continue?")) return;
    }
    const { error } = await supabase.from("member").update(patch).eq("id", id);
    if (error) toast(error.message); else { toast("Saved."); load(); }
  };
  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const { error } = await supabase.from("security_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("tenant_id", settings.tenant_id);
    if (error) toast(error.message); else { setSettings({ ...settings, ...patch }); toast("Security settings saved."); }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-5 py-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Users className="h-6 w-6 text-teal" /> Team &amp; security</h1>
          <p className="mt-1 text-sm text-slate">People listed here can sign in with their email. New people choose <b>Set up my password</b> on the sign-in screen.</p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add person</button>
      </div>

      {adding && <AddMember tenant={who?.member?.tenant_id ?? ""} onDone={() => { setAdding(false); load(); }} onError={toast} />}

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-panel-2 text-[11px] uppercase tracking-wide text-muted">
            <tr>{["Name", "Email", "Role", "Two-step", "Last active", "Access"].map((h) => <th key={h} className="px-4 py-2.5 text-left font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className={cx("border-t border-line", !m.is_active && "opacity-55")}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-navy text-[11px] font-semibold text-white">{(m.first_name[0] ?? "") + (m.last_name[0] ?? "")}</span>
                    <div><div className="font-medium">{m.first_name} {m.last_name}</div>{m.login_name && <div className="text-[11px] text-muted">{m.login_name}</div>}</div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate">{m.email}</td>
                <td className="px-4 py-2.5">
                  <select value={m.role} onChange={(e) => updateMember(m.id, { role: e.target.value as Member["role"] })}
                    className={cx("cursor-pointer rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold capitalize focus:ring-2 focus:ring-amber", ROLE_STYLE[m.role])}>
                    <option value="admin">Admin</option><option value="manager">Manager</option><option value="user">User</option>
                  </select>
                </td>
                <td className="px-4 py-2.5 text-xs">{m.two_factor_method ? <span className="inline-flex items-center gap-1 text-up"><ShieldCheck className="h-3.5 w-3.5" /> Authenticator</span> : <span className="text-muted">Not set up yet</span>}</td>
                <td className="px-4 py-2.5 text-xs text-muted">{m.last_activity_at ? ago(m.last_activity_at) : "Never signed in"}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => updateMember(m.id, { is_active: !m.is_active })}
                    className={cx("relative h-5 w-9 rounded-full transition", m.is_active ? "bg-teal" : "bg-line-strong")} aria-label="Active">
                    <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", m.is_active ? "left-[18px]" : "left-0.5")} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck className="h-4 w-4 text-teal" /> Session rules</h2>
          {settings ? (
            <div className="mt-4 space-y-4 text-sm">
              <Row label="Two-step sign-in" hint="An authenticator code after the password. Always on — enforced by the database.">
                <span className="rounded-full bg-up-soft px-2 py-0.5 text-xs font-semibold text-up">Required</span>
              </Row>
              <Row label="Trust a device for" hint="Skip the code on a trusted browser. 0 turns it off.">
                <NumberField value={settings.trusted_device_days} min={0} max={90} suffix="days" onSave={(v) => saveSettings({ trusted_device_days: v })} />
              </Row>
              <Row label="Sign out after inactivity" hint="A one-minute warning shows first.">
                <NumberField value={settings.idle_timeout_minutes} min={5} max={240} suffix="min" onSave={(v) => saveSettings({ idle_timeout_minutes: v })} />
              </Row>
              <Row label="Sign out when the browser closes" hint="Sign-in cookies end with the browser.">
                <span className="rounded-full bg-up-soft px-2 py-0.5 text-xs font-semibold text-up">On</span>
              </Row>
            </div>
          ) : <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted" />}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Laptop className="h-4 w-4 text-teal" /> Trusted devices</h2>
          <p className="mt-1 text-xs text-muted">Browsers that skip the authenticator code. Removing one asks for the code again next time.</p>
          <ul className="mt-3 divide-y divide-line">
            {!devices.length && <li className="py-6 text-center text-xs text-muted">No trusted devices.</li>}
            {devices.map((d) => {
              const m = members.find((x) => x.id === d.member_id);
              return (
                <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Laptop className="h-4 w-4 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{d.device_name} <span className="font-normal text-muted">· {m ? `${m.first_name} ${m.last_name}` : ""}</span></div>
                    <div className="text-[11px] text-muted">Trusted {ago(d.trusted_at)} · last used {d.last_used_at ? ago(d.last_used_at) : "—"} · expires {new Date(d.expires_at).toLocaleDateString()}</div>
                  </div>
                  <button className="btn-ghost h-7 text-xs text-down" onClick={async () => { await supabase.rpc("revoke_trusted_device", { p_id: d.id }); load(); }}>Remove</button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {toastNode}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div><div className="font-medium">{label}</div><div className="text-xs text-muted">{hint}</div></div>
      {children}
    </div>
  );
}

function NumberField({ value, min, max, suffix, onSave }: { value: number; min: number; max: number; suffix: string; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
    setV(String(n));
    if (n !== value) onSave(n);
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <input className="input h-8 w-16 py-1 text-right tnum" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      <span className="text-xs text-muted">{suffix}</span>
    </span>
  );
}

function AddMember({ tenant, onDone, onError }: { tenant: string; onDone: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", role: "user" as Member["role"], mobile: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("member").insert({ ...f, email: f.email.trim().toLowerCase(), tenant_id: tenant, mobile: f.mobile || null });
    setBusy(false);
    if (error) onError(error.message.includes("duplicate") ? "That email is already on the team." : error.message);
    else onDone();
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="card grid animate-fade-up gap-3 p-5 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto] sm:items-end">
      <div><label className="label">First name</label><input className="input" required value={f.first_name} onChange={set("first_name")} autoFocus /></div>
      <div><label className="label">Last name</label><input className="input" required value={f.last_name} onChange={set("last_name")} /></div>
      <div><label className="label">Email</label><input className="input" type="email" required value={f.email} onChange={set("email")} /></div>
      <div><label className="label">Role</label>
        <select className="input" value={f.role} onChange={set("role")}><option value="user">User</option><option value="manager">Manager</option><option value="admin">Admin</option></select>
      </div>
      <button className="btn-primary h-[38px]" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</button>
    </form>
  );
}
