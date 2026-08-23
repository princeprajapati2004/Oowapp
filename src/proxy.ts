import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, SA_SESSION_COOKIE, verifySession, verifySuperAdminSession } from "@/lib/auth";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DURATION_SECONDS } from "@/lib/referral-attribution";

const PUBLIC_ADMIN_PATHS = ["/admin/signup", "/admin/signup/business-details"];
const PUBLIC_SUPER_ADMIN_PATHS = ["/super-admin/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A referral link (`/order/[slug]?ref=CODE`) — stash the code in a 7-day
  // cookie so it survives menu-browsing before the visitor signs up/logs in
  // (see referral-attribution.ts, consumed at account-creation time). Never
  // blocks the request either way, just passes it through.
  if (pathname.startsWith("/order/")) {
    const ref = request.nextUrl.searchParams.get("ref");
    if (ref) {
      const response = NextResponse.next();
      response.cookies.set(REFERRAL_COOKIE, ref.trim().toUpperCase(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: REFERRAL_COOKIE_DURATION_SECONDS,
      });
      return response;
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/super-admin")) {
    if (PUBLIC_SUPER_ADMIN_PATHS.some((path) => pathname === path)) {
      return NextResponse.next();
    }
    const token = request.cookies.get(SA_SESSION_COOKIE)?.value;
    const session = token ? await verifySuperAdminSession(token) : null;
    if (!session) {
      return NextResponse.redirect(new URL("/super-admin/login", request.url));
    }
    return NextResponse.next();
  }

  if (PUBLIC_ADMIN_PATHS.some((path) => pathname === path)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/super-admin/:path*", "/order/:path*"],
};
