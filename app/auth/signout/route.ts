import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// Sign out (menu, idle timeout, closed browser). Signing out ends THIS
// session's trust; the device stays trusted for the next sign-in.
export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  try {
    const supabase = await supabaseServer();
    await supabase.rpc("end_trusted_session");
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* already signed out */
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?reason=${reason === "idle" || reason === "closed" ? reason : "signedout"}`;
  return NextResponse.redirect(url, 303);
}
