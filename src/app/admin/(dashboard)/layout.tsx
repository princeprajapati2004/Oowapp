import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listNotifications } from "@/lib/services/notification";
import { AdminShell } from "@/components/admin/admin-shell";
import { isFoodBusiness, businessTypeCopy, type BusinessType } from "@/lib/business-types";
import { NotFoundError } from "@/lib/api-utils";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  // layout.tsx errors are NOT caught by this segment's own error.tsx (Next.js
  // only wraps children with it, not sibling layouts — see global-error.tsx),
  // so an uncaught throw here takes down the whole app instead of just this
  // page. getShopById throwing NotFoundError is a real, reachable case: the
  // session cookie is a validly-signed JWT for a shopId that no longer
  // resolves (e.g. the shop was deleted after the cookie was issued).
  // Redirecting straight to /login wouldn't help either — the cookie is
  // still valid, so /login's own session check would just bounce back here
  // and recreate the crash — so this clears it server-side first.
  let shop;
  try {
    shop = await getShopById(session.shopId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      redirect("/api/auth/clear-session");
    }
    throw err;
  }

  const notifications = await listNotifications(session.shopId).catch(() => []);

  // New signups (createShopForAdmin sets this false) must finish mobile
  // verification + business profile before reaching any dashboard page.
  // Pre-existing shops default to true and are never gated retroactively.
  if (!shop.onboardingCompleted) {
    redirect("/admin/onboarding");
  }

  const initialNotifications = notifications.map((n) => ({
    id: n.id,
    shopId: n.shopId,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  const businessType = (shop.businessType ?? "RESTAURANT") as BusinessType;
  const copy = businessTypeCopy(businessType);
  const foodBusiness = isFoodBusiness(businessType);

  return (
    <AdminShell
      shopName={shop.businessName}
      shopSlug={shop.slug}
      initialNotifications={initialNotifications}
      isFoodBusiness={foodBusiness}
      copy={copy}
    >
      {children}
    </AdminShell>
  );
}
