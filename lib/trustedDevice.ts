"use server";

import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

// "Trust this device" (ported from LIFESuite).
//   The browser keeps a random token in a PRIVATE cookie (httpOnly: page
//   scripts can't read it — only Watchman's server). The database keeps only
//   its SHA-256 fingerprint.

const COOKIE = "wf_trust";
const fingerprint = (token: string) => createHash("sha256").update(token).digest("hex");

async function deviceName(): Promise<string> {
  const ua = (await headers()).get("user-agent") ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "device";
  return `${browser} on ${os}`;
}

// Right after a good authenticator code, with the box ticked.
export async function trustThisDevice(): Promise<{ ok: boolean; error?: string }> {
  const token = randomBytes(32).toString("hex");
  const supabase = await supabaseServer();
  const { data: until, error } = await supabase.rpc("trust_this_device", {
    p_token_hash: fingerprint(token),
    p_device_name: await deviceName(),
  });
  if (error || !until) return { ok: false, error: error?.message ?? "Couldn't trust this device." };
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(until as string),
  });
  return { ok: true };
}

// Right after the password: is this a trusted device? If so this sign-in
// skips the code (the database records it). The sign-in page passes its
// brand-new access token so the check never runs before the server sees the
// new session. The cookie is cleared only when the database definitely says
// this device's trust has ended.
export async function checkTrustedDevice(accessToken?: string): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const supabase = accessToken
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await supabaseServer();
  const { data: who } = await supabase.auth.getUser(accessToken);
  if (!who?.user) return false;
  const { data, error } = await supabase.rpc("use_trusted_device", { p_token_hash: fingerprint(token) });
  if (error) return false;
  if (data === true) return true;
  (await cookies()).set(COOKIE, "", { path: "/", maxAge: 0 });
  return false;
}
