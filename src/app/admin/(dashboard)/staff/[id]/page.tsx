import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { StaffProfile } from "@/components/admin/staff-profile";

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const shop = await getShopById(session.shopId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const member = await (db as any).staffMember.findFirst({
    where: { id, shopId: session.shopId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  if (!member) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentOrders = await (db as any).order.findMany({
    where: { staffId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      billNumber: true,
      grandTotal: true,
      status: true,
      paymentMethod: true,
      createdAt: true,
    },
  });

  return (
    <StaffProfile
      initialMember={{
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        isActive: member.isActive,
        lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
        createdAt: member.createdAt.toISOString(),
        orderCount: member._count.orders,
      }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentOrders={recentOrders.map((o: any) => ({
        id: o.id,
        billNumber: o.billNumber,
        grandTotal: Number(o.grandTotal),
        status: o.status,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt.toISOString(),
      }))}
      currency={shop.currency}
    />
  );
}
