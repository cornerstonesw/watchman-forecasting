"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import AuthShell, { ErrorBanner, NoteBanner, safeNext } from "@/components/auth/AuthShell";
import { checkTrustedDevice } from "@/lib/trustedDevice";

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}

const REASONS: Record<string, string> = {
  idle: "You were signed out after a period of inactivity.",
  closed: "You were signed out when the browser closed.",
  signedout: "You're signed out.",
};

// Step 1 of signing in: email + password. Then the database links the account
// to its member record (claim_member), and a trusted device skips step 2.
function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const reason = REASONS[params.get("reason") ?? ""];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError || !data.session) {
      setBusy(false);
      return setError(
        /confirm/i.test(signInError?.message ?? "")
          ? "Please confirm your email address first — check your inbox for the link."
          : "That email and password don't match. Try again, or reset your password."
      );
    }
    const { data: claim } = await supabase.rpc("claim_member");
    if (!claim?.ok) {
      await supabase.auth.signOut({ scope: "local" });
      setBusy(false);
      return setError(claim?.message ?? "You don't have access to Watchman.");
    }
    const trusted = await checkTrustedDevice(data.session.access_token).catch(() => false);
    router.replace(trusted ? next : `/mfa${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
    router.refresh();
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Two-step sign-in comes next."
      footer={<>Need access? Ask your Watchman administrator.</>}>
      {reason && !error && <NoteBanner>{reason}</NoteBanner>}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-xs font-medium text-teal hover:underline">Forgot password?</Link>
          </div>
          <input id="password" className="input" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-primary h-10 w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Sign in
        </button>
      </form>
      <p className="mt-5 text-center text-xs text-muted">
        First time? Use <Link href="/forgot-password?first=1" className="font-medium text-teal hover:underline">Set up my password</Link> with the email your administrator added.
      </p>
    </AuthShell>
  );
}
