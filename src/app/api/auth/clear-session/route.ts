import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

// GET (not POST, unlike /logout): meant to be reached via redirect() from a
// Server Component that found its session cookie carries a shopId with no
// matching Shop (e.g. deleted after the cookie was issued) — Server
// Components can't mutate cookies themselves, so the layout redirects here
// to actually clear the stale cookie before landing on /login. Without this,
// redirecting straight to /login would bounce right back to /admin (the
// cookie is still a validly-signed JWT) and re-crash the same way.
export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", request.url));
}
