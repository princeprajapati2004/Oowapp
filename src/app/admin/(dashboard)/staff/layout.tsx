import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/services/feature-permission";
import { FeatureLockedState } from "@/components/admin/feature-locked-state";

// Applies to /admin/staff and /admin/staff/[id] — the Owner-facing staff
// management screens only. Gating "multi_staff" here does NOT touch staff
// runtime operation (Kitchen Display, Cash Counter, staff login itself) —
// those are separate routes under /staff, /kitchen, /admin/counter and stay
// unaffected so a subscription lapse never locks out staff mid-shift.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const enabled = await isFeatureEnabled(session.shopId, "multi_staff");
  if (!enabled) return <FeatureLockedState featureLabel="Staff Management" />;

  return children;
}
