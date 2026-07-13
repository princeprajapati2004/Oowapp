import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle, ArrowRight, QrCode } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listCategories } from "@/lib/services/category";
import { listProducts } from "@/lib/services/product";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const [shop, categories, products] = await Promise.all([
    getShopById(session.shopId),
    listCategories(session.shopId),
    listProducts(session.shopId),
  ]);

  const checklist = [
    { label: "Add your logo & business info", done: !!shop.logoUrl, href: "/admin/settings" },
    { label: "Add a category", done: categories.length > 0, href: "/admin/categories" },
    { label: "Add your first product", done: products.length > 0, href: "/admin/products" },
    { label: "Set your WhatsApp number", done: !!shop.whatsappNumber, href: "/admin/settings" },
  ];

  let todayStats: { count: number; revenue: number } | null = null;
  if (shop.saveOrdersToDb) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todaysOrders = await db.order.findMany({
      where: { shopId: shop.id, createdAt: { gte: startOfToday } },
      select: { grandTotal: true },
    });
    todayStats = {
      count: todaysOrders.length,
      revenue: todaysOrders.reduce((sum, o) => sum + Number(o.grandTotal), 0),
    };
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome, {shop.businessName}</h1>
        <p className="text-muted-foreground">Here&apos;s how your shop is set up.</p>
      </div>

      {todayStats ? (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Orders today</CardDescription>
              <CardTitle className="text-3xl">{todayStats.count}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Revenue today</CardDescription>
              <CardTitle className="text-3xl">{formatCurrency(todayStats.revenue, shop.currency)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Setup checklist</CardTitle>
          <CardDescription>Finish these to go fully live.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {checklist.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted"
            >
              <span className="flex items-center gap-2 text-sm">
                {item.done ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={cn(item.done && "text-muted-foreground line-through")}>{item.label}</span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          <div>
            <p className="font-medium">Ready to go live?</p>
            <p className="text-sm text-muted-foreground">
              Download your QR code and place it where customers can scan it.
            </p>
          </div>
          <Button render={<Link href="/admin/qr" />} nativeButton={false}>
            <QrCode className="size-4" /> Get QR code
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
