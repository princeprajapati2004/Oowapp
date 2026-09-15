import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/services/feature-permission";
import { FeatureLockedState } from "@/components/admin/feature-locked-state";

// Applies to every route under /admin/reports/** — a nav-hidden link is not
// security, so direct URL access to any report sub-page is re-checked here
// in one place rather than per report page.
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const enabled = await isFeatureEnabled(session.shopId, "advanced_reports");
  if (!enabled) return <FeatureLockedState featureLabel="Reports" />;

  return children;
}
