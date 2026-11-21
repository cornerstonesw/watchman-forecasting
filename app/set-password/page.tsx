"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import AuthShell, { ErrorBanner } from "@/components/auth/AuthShell";
import { PASSWORD_MIN, passwordProblem, passwordWasBreached } from "@/lib/password";

// Choose a password (first time, or after a reset link). NIST-style rules:
// length over complexity, no known-breached passwords. Then two-step sign-in.
export default function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const problem = passwordProblem(pw, u.user?.email);
    if (problem) return setError(problem);
    if (pw !== pw2) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    if (await passwordWasBreached(pw)) {
      setBusy(false);
      return setError("That password has appeared in a known data breach. Please choose another.");
    }
    const { error: upd } = await supabase.auth.updateUser({ password: pw });
    if (upd) {
      setBusy(false);
      return setError(/aal2|reauth/i.test(upd.message) ? "Enter your authenticator code first, then change your password." : upd.message);
    }
    // already fully signed in (changing a password) → back to work; else on to two-step
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    router.replace(aal?.currentLevel === "aal2" ? "/" : "/mfa");
    router.refresh();
  };

  return (
    <AuthShell title="Choose a password" subtitle={`At least ${PASSWORD_MIN} characters. A short phrase is easiest to remember.`}>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="pw">New password</label>
          <input id="pw" className="input" type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
          <div className="mt-1.5 h-1 overflow-hidden rounded bg-sunken">
            <div className="h-full rounded bg-teal transition-all" style={{ width: `${Math.min(100, (pw.length / PASSWORD_MIN) * 100)}%` }} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pw2">Type it again</label>
          <input id="pw2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <button className="btn-primary h-10 w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Save password
        </button>
      </form>
    </AuthShell>
  );
}
