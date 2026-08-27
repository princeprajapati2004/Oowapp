import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ReportCatalogEntry } from "@/lib/reports-catalog";

export function ReportCard({ report }: { report: ReportCatalogEntry }) {
  const Icon = report.icon;
  return (
    <Link href={`/admin/reports/${report.slug}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 px-4 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="font-heading text-sm font-medium">{report.title}</h3>
            <p className="text-xs text-muted-foreground">{report.description}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            View Report <ArrowRight className="size-3" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
