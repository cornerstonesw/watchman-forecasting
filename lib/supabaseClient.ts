"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserCookies } from "@/lib/sessionCookies";

// The browser's Supabase client. It carries the signed-in person's session,
// so every query runs as them and row-level security decides what they see.
// Sign-in cookies end when the browser closes (lib/sessionCookies.ts).
// Created on first use (never during the server's pre-render).
let client: SupabaseClient | null = null;
const get = () =>
  (client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: browserCookies(),
  }));

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = get();
    const v = (c as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
