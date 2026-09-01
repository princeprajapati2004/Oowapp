import { Card, CardContent } from "@/components/ui/card";
import { formatSummaryValue, type ReportSummaryItem } from "@/lib/utils/report-columns";

export function ReportSummaryCards({ items }: { items: ReportSummaryItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="font-heading text-lg font-semibold">{formatSummaryValue(item)}</p>
            {item.hint && <p className="text-[11px] text-muted-foreground">{item.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
