import { requireAdminSession } from "@/lib/session";
import { UsageHistoryPageClient } from "@/components/admin/subscription/usage-history-page-client";

export default async function UsageHistoryPage() {
  await requireAdminSession();
  return <UsageHistoryPageClient />;
}
