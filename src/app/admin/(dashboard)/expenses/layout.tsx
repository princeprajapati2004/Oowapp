import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/services/feature-permission";
import { FeatureLockedState } from "@/components/admin/feature-locked-state";

// Applies to /admin/expenses and /admin/expenses/[id].
export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const enabled = await isFeatureEnabled(session.shopId, "expenses");
  if (!enabled) return <FeatureLockedState featureLabel="Expense Tracking" />;

  return children;
}
