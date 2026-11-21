import type { CookieOptions } from "@supabase/ssr";

// "Close the browser = signed out": the Supabase sign-in cookies are made
// SESSION cookies (no expiry date), so the browser drops them when it closes.
// Supabase's helper always asks for 400 days; this takes the date off.
// (Removals — maxAge 0 — pass through unchanged.)
// Closing just the Watchman TAB is handled in the app (SessionGuard).
export function sessionOnly(options: CookieOptions): CookieOptions {
  if (options.maxAge === 0) return options;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxAge, expires, ...rest } = options;
  return rest;
}

// The browser side of the same thing (document.cookie).
export function browserCookies() {
  return {
    getAll: () =>
      document.cookie
        .split("; ")
        .filter(Boolean)
        .map((c) => {
          const i = c.indexOf("=");
          return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) };
        }),
    setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
      list.forEach(({ name, value, options }) => {
        const o = sessionOnly(options);
        let s = `${name}=${encodeURIComponent(value)}; Path=${o.path ?? "/"}; SameSite=${o.sameSite === "strict" ? "Strict" : o.sameSite === "none" ? "None" : "Lax"}`;
        if (o.maxAge === 0) s += "; Max-Age=0";
        if (o.domain) s += `; Domain=${o.domain}`;
        if (location.protocol === "https:") s += "; Secure";
        document.cookie = s;
      });
    },
  };
}
