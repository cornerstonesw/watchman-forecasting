"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import AuthShell, { ErrorBanner, NoteBanner } from "@/components/auth/AuthShell";

export default function ForgotPage() {
  return <Suspense><Forgot /></Suspense>;
}

// Reset — or set for the first time — a password. Supabase emails a link that
// lands on /auth/confirm, which continues to /set-password. The answer is the
// same whether or not the email has an account (no account guessing).
function Forgot() {
  const first = useSearchParams().get("first") === "1";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let failure: { message: string; status?: number } | null = null;
    const redirectTo = `${window.location.origin}/auth/confirm?type=recovery`;
    if (first) {
      // first time: create the sign-in account (only an invited email can get in — claim_member)
      const temp = crypto.getRandomValues(new Uint8Array(24)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
      const { data, error: e1 } = await supabase.auth.signUp({ email: email.trim(), password: temp, options: { emailRedirectTo: `${window.location.origin}/auth/confirm?type=signup` } });
      // already has an account (Supabase answers with no identities): send a set-password link instead
      failure = e1;
      if (!e1 && data.user && !data.user.identities?.length)
        failure = (await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })).error;
    } else {
      failure = (await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })).error;
    }
    setBusy(false);
    // only a sending problem is shown — never whether the address has an account
    if (failure && (failure.status === 429 || /rate limit/i.test(failure.message))) {
      return setError("Too many emails were sent in the last hour. Please wait a few minutes and try again.");
    }
    setSent(true);
  };

  return (
    <AuthShell title={first ? "Set up my password" : "Reset password"}
      subtitle={first ? "We'll email you a link to set your password." : "We'll email you a link to choose a new password."}
      footer={<Link href="/login" className="font-medium text-teal hover:underline">Back to sign in</Link>}>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {sent ? (
        <NoteBanner>If <b>{email}</b> has Watchman access, a link is on its way. It expires in an hour.</NoteBanner>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn-primary h-10 w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email me a link
          </button>
        </form>
      )}
    </AuthShell>
  );
}
