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
  if (!session) redirect("/login");

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
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-28">Bill No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Table / Address</TableHead>
                <TableHead className="hidden md:table-cell">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serialized.map((order) => (
                <TableRow key={order.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    {order.billNumber}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{order.customerName || "—"}</div>
                    {order.customerPhone ? (
                      <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground max-w-32 truncate">
                    {order.tableNumber || order.deliveryAddress || "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary" className="font-medium">
                      {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold text-sm">
                      {formatCurrency(order.grandTotal, shop.currency)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right">
                    <div className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </div>
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
