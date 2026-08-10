import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, SA_SESSION_COOKIE, verifySession, verifySuperAdminSession } from "@/lib/auth";

const PUBLIC_ADMIN_PATHS = ["/admin/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/super-admin")) {
    const token = request.cookies.get(SA_SESSION_COOKIE)?.value;
    const session = token ? await verifySuperAdminSession(token) : null;
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
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
  matcher: ["/admin/:path*", "/super-admin/:path*"],
};
