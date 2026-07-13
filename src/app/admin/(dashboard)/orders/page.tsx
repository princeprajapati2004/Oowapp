import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { serializeOrders } from "@/lib/serialize";
import { formatCurrency } from "@/lib/utils/currency";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function OrdersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const shop = await getShopById(session.shopId);

  if (!shop.saveOrdersToDb) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <EmptyState
          icon={ClipboardList}
          title="Order history is off"
          description={
            'Turn on "Save orders to database" in Settings to start logging orders here. Orders always reach you on WhatsApp either way.'
          }
        />
      </div>
    );
  }

  const orders = await db.order.findMany({
    where: { shopId: session.shopId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: true },
  });
  const serialized = serializeOrders(orders);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">Last {serialized.length} orders placed through your menu.</p>
      </div>

      {serialized.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No orders yet"
          description="Orders placed by customers will show up here."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Table / Address</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serialized.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.billNumber}</TableCell>
                  <TableCell>
                    {order.customerName || "—"}
                    {order.customerPhone ? (
                      <span className="block text-xs text-muted-foreground">{order.customerPhone}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{order.tableNumber || order.deliveryAddress || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(order.grandTotal, shop.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
