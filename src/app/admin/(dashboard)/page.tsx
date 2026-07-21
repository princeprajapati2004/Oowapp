import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle, ArrowRight, QrCode, ShoppingBag, TrendingUp, Sparkles } from "lucide-react";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listCategories } from "@/lib/services/category";
import { listProducts } from "@/lib/services/product";
import { getSubscriptionSummaryForBusiness } from "@/lib/services/subscription";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SubscriptionCard } from "@/components/admin/subscription-card";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [shop, categories, products, subscription] = await Promise.all([
    getShopById(session.shopId),
    listCategories(session.shopId),
    listProducts(session.shopId),
    getSubscriptionSummaryForBusiness(session.shopId),
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

  const doneCount = checklist.filter((item) => item.done).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground">{shop.businessName}</p>
      </div>

      <SubscriptionCard subscription={subscription} />

      {todayStats ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardDescription>Orders today</CardDescription>
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <ShoppingBag className="size-4 text-primary" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold tabular-nums">{todayStats.count}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardDescription>Revenue today</CardDescription>
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <TrendingUp className="size-4 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold tabular-nums leading-tight">
                {formatCurrency(todayStats.revenue, shop.currency)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Setup checklist</CardTitle>
              <CardDescription>Complete these to go fully live.</CardDescription>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="tabular-nums">{doneCount}/{checklist.length}</span>
            </div>
          </div>
          {doneCount > 0 && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(doneCount / checklist.length) * 100}%` }}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          {checklist.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2.5 text-sm">
                {item.done ? (
                  <CheckCircle2 className="size-4 text-primary shrink-0" />
                ) : (
                  <Circle className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className={cn("leading-tight", item.done && "text-muted-foreground line-through")}>{item.label}</span>
              </span>
              {!item.done && <ArrowRight className="size-4 text-muted-foreground shrink-0" />}
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              <p className="font-semibold text-sm">Ready to go live?</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Download your QR code and place it where customers can scan it.
            </p>
          </div>
          <Button render={<Link href="/admin/qr" />} nativeButton={false} className="shrink-0">
            <QrCode className="size-4" /> Get QR code
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
