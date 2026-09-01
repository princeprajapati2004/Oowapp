import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { REPORTS_CATALOG, type ReportCatalogEntry } from "@/lib/reports-catalog";
import { ReportCard } from "@/components/admin/reports/report-card";

const GROUP_ORDER: ReportCatalogEntry["group"][] = ["Sales & Purchases", "Finance", "Inventory", "Parties", "Marketing"];

export default async function ReportsHubPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">View, filter, export and manage your business financial and operational reports.</p>
      </div>

      {GROUP_ORDER.map((group) => {
        const reports = REPORTS_CATALOG.filter((r) => r.group === group);
        if (reports.length === 0) return null;
        return (
          <div key={group} className="space-y-2 sm:space-y-3">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {reports.map((report) => (
                <ReportCard key={report.slug} report={report} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
