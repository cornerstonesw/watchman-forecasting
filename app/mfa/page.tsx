"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import AuthShell, { ErrorBanner, safeNext } from "@/components/auth/AuthShell";
import { trustThisDevice } from "@/lib/trustedDevice";

export default function MfaPage() {
  return <Suspense><Mfa /></Suspense>;
}

// Supabase returns the QR code as "data:image/svg+xml;utf-8,<svg …>" with the
// markup unencoded, which some browsers won't draw. Encode it properly.
function qrSrc(qr: string): string {
  const m = qr.match(/^data:image\/svg\+xml;(?:charset=)?utf-8,(<svg[\s\S]*)$/i);
  return m ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(m[1])}` : qr;
}

type Mode = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string; uri: string } | { kind: "verify"; factorId: string };

// Step 2 of signing in: an authenticator app (Microsoft / Google Authenticator,
// 1Password…). First time: scan the QR code, then enter the 6-digit code.
function Mfa() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trustDays, setTrustDays] = useState(0);
  const [trust, setTrust] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [onPhone, setOnPhone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    setOnPhone(window.matchMedia("(pointer: coarse)").matches);
    if (started.current) return;
    started.current = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return router.replace("/login");
      supabase.rpc("sign_in_options").then(({ data }) => setTrustDays(Number(data?.trusted_device_days) || 0));
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) return setError(listError.message);
      const verified = factors.totp.find((f) => f.status === "verified");
      if (verified) return setMode({ kind: "verify", factorId: verified.id });
      for (const f of factors.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp", issuer: "Watchman Forecasting", friendlyName: "Authenticator app",
      });
      if (enrollError || !enrolled) return setError(enrollError?.message ?? "Couldn't start two-step setup.");
      const uri = `otpauth://totp/${encodeURIComponent(`Watchman Forecasting:${u.user.email ?? ""}`)}?secret=${enrolled.totp.secret}&issuer=${encodeURIComponent("Watchman Forecasting")}`;
      setMode({ kind: "enroll", factorId: enrolled.id, qr: qrSrc(enrolled.totp.qr_code), secret: enrolled.totp.secret, uri });
    })();
  }, [router]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (mode.kind === "loading" || busy) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: mode.factorId, code: digits });
    if (verifyError) {
      setBusy(false);
      setCode("");
      return setError("That code didn't work. Codes change every 30 seconds — try the current one.");
    }
    if (mode.kind === "enroll") await supabase.rpc("note_two_factor", { p_method: "authenticator" });
    await supabase.rpc("claim_member");
    if (trust && trustDays > 0) await trustThisDevice().catch(() => undefined);
    router.replace(next);
    router.refresh();
  };

  // auto-submit when the 6th digit lands
  useEffect(() => {
    if (code.replace(/\D/g, "").length === 6 && !busy) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <AuthShell
      title={mode.kind === "enroll" ? "Set up two-step sign-in" : "Two-step sign-in"}
      subtitle={mode.kind === "enroll"
        ? "Scan this with an authenticator app, then enter the 6-digit code it shows."
        : "Enter the 6-digit code from your authenticator app."}
      footer={<a href="/auth/signout" className="font-medium text-teal hover:underline">Sign in as someone else</a>}>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {mode.kind === "loading" && !error && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted" /></div>}
      {mode.kind === "enroll" && (
        <div className="mb-5 text-center">
          {onPhone ? (
            <a href={mode.uri} className="btn-outline w-full"><Smartphone className="h-4 w-4" /> Add to my authenticator app</a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mode.qr} alt="QR code for your authenticator app" className="mx-auto h-44 w-44 rounded-lg border border-line bg-white p-2" />
          )}
          <button type="button" className="mt-2 text-xs font-medium text-teal hover:underline" onClick={() => setShowSecret((s) => !s)}>
            {showSecret ? "Hide the setup key" : "Can't scan? Type a key instead"}
          </button>
          {showSecret && <div className="mt-2 select-all break-all rounded-md bg-sunken px-3 py-2 font-mono text-xs">{mode.secret}</div>}
        </div>
      )}
      {mode.kind !== "loading" && (
        <form onSubmit={submit} className="space-y-4">
          <input className="input h-12 text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code"
            maxLength={7} autoFocus placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} />
          {trustDays > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate">
              <input type="checkbox" className="h-4 w-4 accent-teal" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
              Trust this device for {trustDays} days
            </label>
          )}
          <button className="btn-primary h-10 w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify
          </button>
        </form>
      )}
    </AuthShell>
  );
}
