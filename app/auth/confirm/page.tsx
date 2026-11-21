"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import AuthShell, { ErrorBanner } from "@/components/auth/AuthShell";

export default function ConfirmPage() {
  return <Suspense><Confirm /></Suspense>;
}

// Where the links in Supabase's emails land (sign-up, password reset, invite).
// Handles ?code=…, ?token_hash=…&type=…, and #access_token=… .
// Nothing happens until the person clicks Continue: email link scanners
// (Microsoft Safe Links) open links in a hidden browser and would use up the
// link before the person ever saw it. A scanner doesn't click buttons.
function Confirm() {
  const router = useRouter();
  const params = useSearchParams();
  const [go, setGo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!go || done.current) return;
    done.current = true;
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const type = params.get("type") ?? hash.get("type");
      if (params.get("error_description") ?? hash.get("error_description")) {
        return setError("This link has expired or was already used. Ask for a new one.");
      }
      let failure: string | null = null;
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      if (code) failure = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
      else if (tokenHash && type) failure = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })).error?.message ?? null;
      else if (hash.get("access_token") && hash.get("refresh_token"))
        failure = (await supabase.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! })).error?.message ?? null;
      else failure = "missing";
      if (failure) return setError("This link has expired or was already used. Ask for a new one.");
      const { data: claim } = await supabase.rpc("claim_member");
      if (!claim?.ok) {
        await supabase.auth.signOut({ scope: "local" });
        return setError(claim?.message ?? "You don't have access to Watchman.");
      }
      router.replace("/set-password");
    })();
  }, [go, params, router]);

  return (
    <AuthShell title="Almost there" subtitle="Continue to set your password and two-step sign-in.">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!error && (
        <button className="btn-primary h-10 w-full" onClick={() => setGo(true)} disabled={go}>
          {go ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Continue
        </button>
      )}
    </AuthShell>
  );
}
