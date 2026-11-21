import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { sessionOnly } from "@/lib/sessionCookies";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Supabase client for server code that acts AS the signed-in person.
// Row-level security applies exactly as in the browser; nothing here bypasses it.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list: CookieToSet[]) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, sessionOnly(options)));
        } catch {
          /* called from a server component — the middleware refreshes cookies instead */
        }
      },
    },
  });
}
