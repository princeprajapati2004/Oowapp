import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ReportPageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="space-y-3 print:hidden">
      <Link href="/admin/reports" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Reports
      </Link>
      <div>
        <h1 className="font-heading text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
