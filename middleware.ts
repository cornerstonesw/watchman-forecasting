import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { sessionOnly } from "@/lib/sessionCookies";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Runs before every page: keeps the Supabase session fresh and sends people
// to the right step of signing in (same flow as LIFESuite):
//
//   not signed in                     → /login
//   password OK, two-step not done    → /mfa (set up the authenticator, or enter its code)
//                                       (unless this browser is a trusted device)
//   fully signed in, on /login        → home
//
// This only steers the screens. The real lock is in the database: row-level
// security only lets an ACTIVE member who has completed two-step read or
// change anything (migration 20261121200200_sign_in_security.sql).

const PUBLIC = ["/login", "/forgot-password", "/auth/confirm", "/auth/signout"];
const HALF_SIGNED_IN_OK = ["/mfa", "/set-password"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const starts = (list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

  const redirect = (to: string, withNext = true) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    if (withNext && path !== "/" && !starts(PUBLIC) && !starts(HALF_SIGNED_IN_OK)) {
      url.searchParams.set("next", path + request.nextUrl.search);
    }
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: CookieToSet[]) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, sessionOnly(options)));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return starts(PUBLIC) ? response : redirect("/login");

  // Two-step done, or a trusted device / two-step off — the database decides.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  let fullySignedIn = aal?.currentLevel === "aal2";
  if (!fullySignedIn) {
    const { data: ok } = await supabase.rpc("two_step_ok");
    fullySignedIn = ok === true;
  }
  if (!fullySignedIn) {
    return starts(PUBLIC) || starts(HALF_SIGNED_IN_OK) ? response : redirect("/mfa");
  }

  const pageVisit = request.method === "GET" && !request.headers.has("next-action");
  if (pageVisit && (path === "/login" || (path === "/mfa" && aal?.currentLevel === "aal2"))) {
    return redirect("/", false);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)"],
};
