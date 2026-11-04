import { headers } from "next/headers";
import { getAdminSession } from "@/lib/session";
import { getStaffSession } from "@/lib/staff-session";
import { resolveAdminIdForShop, isAccountAccessBlocked } from "@/lib/services/subscription";
import { SubscriptionExpiredScreen } from "@/components/shared/subscription-expired-screen";

// Routes that must stay reachable even when the account's subscription is
// expired — the owner needs a way back in to actually renew, and
// login/signup/onboarding happen before any subscription exists yet.
const EXEMPT_PREFIXES = ["/admin/login", "/admin/signup", "/admin/onboarding", "/admin/subscription"];

/**
 * Single choke point for every route under /admin — including the
 * standalone full-page editors outside the (dashboard) route group
 * (counter, kitchen, products/new, orders/create, etc.) that have no other
 * shared layout. Wraps (dashboard)/layout.tsx too, so that one never needs
 * its own copy of this check. See subscription.ts::isAccountAccessBlocked
 * for what "blocked" means and src/proxy.ts for how `pathname` gets here.
 */
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return children;
  }

  const [adminSession, staffSession] = await Promise.all([getAdminSession(), getStaffSession()]);
  // Neither session present — not this layout's job to redirect; the
  // destination page/layout already handles its own "please log in" flow.
  if (!adminSession && !staffSession) return children;

  const adminId = adminSession?.adminId ?? (await resolveAdminIdForShop(staffSession!.shopId));
  if (await isAccountAccessBlocked(adminId)) {
    return <SubscriptionExpiredScreen variant={adminSession ? "owner" : "staff"} />;
  }

  return children;
}
