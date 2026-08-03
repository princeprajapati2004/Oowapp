import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { getMenuImport } from "@/lib/services/menu-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/currency";

interface SnapshotItem {
  name: string;
  price: number | null;
  category: string;
  foodType: string;
  confidence: "high" | "low";
  resolution?: "skip" | "update" | "keep_both";
}

export default async function MenuImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [record, shop] = await Promise.all([getMenuImport(session.shopId, id), getShopById(session.shopId)]);
  const items = Array.isArray(record.snapshot) ? (record.snapshot as unknown as SnapshotItem[]) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          render={<Link href="/admin/menu-import/history" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{record.fileName ?? "Import"}</h1>
          <p className="text-sm text-muted-foreground">
            {record.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge>{record.itemsImported} added</Badge>
        <Badge variant="secondary">{record.itemsUpdated} updated</Badge>
        <Badge variant="outline">{record.itemsSkipped} skipped</Badge>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => (
              <TableRow key={i}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell className="text-right">
                  {item.price === null ? "—" : formatCurrency(item.price, shop.currency)}
                </TableCell>
                <TableCell>{item.foodType}</TableCell>
                <TableCell>
                  {item.resolution === "skip" ? (
                    <Badge variant="outline">Skipped</Badge>
                  ) : item.resolution === "update" ? (
                    <Badge variant="secondary">Updated</Badge>
                  ) : (
                    <Badge>Added</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
