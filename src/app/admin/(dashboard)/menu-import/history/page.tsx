import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { listMenuImports } from "@/lib/services/menu-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";

const SOURCE_LABELS: Record<string, string> = {
  EXCEL: "Excel",
  CSV: "CSV",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  COMPLETED: "default",
  PARTIAL: "secondary",
  FAILED: "destructive",
};

export default async function MenuImportHistoryPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const imports = await listMenuImports(session.shopId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/menu-import" />} nativeButton={false}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Import history</h1>
          <p className="text-sm text-muted-foreground">Past bulk imports for this shop.</p>
        </div>
      </div>

      {imports.length === 0 ? (
        <EmptyState
          icon={History}
          title="No imports yet"
          description="Files you import through Bulk Import will show up here."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Added</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="text-right">Skipped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/admin/menu-import/history/${row.id}`} className="hover:underline">
                      {row.createdAt.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Link>
                  </TableCell>
                  <TableCell>{SOURCE_LABELS[row.sourceType] ?? row.sourceType}</TableCell>
                  <TableCell className="max-w-48 truncate">{row.fileName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{row.itemsImported}</TableCell>
                  <TableCell className="text-right">{row.itemsUpdated}</TableCell>
                  <TableCell className="text-right">{row.itemsSkipped}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
