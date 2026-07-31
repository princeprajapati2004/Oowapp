import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";
import { StaffManager } from "@/components/admin/staff-manager";

export default async function StaffPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staff = await (db as any).staffMember.findMany({
    where: { shopId: session.shopId },
    orderBy: { createdAt: "asc" },
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serialized = staff.map(({ _count, ...s }: any) => ({
    ...s,
    lastLoginAt: s.lastLoginAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    orderCount: _count.orders,
  }));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="text-muted-foreground">
          Manage kitchen staff, waiters, and managers. Staff members log in at{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">/staff/login</code>.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 text-sm space-y-2">
        <p className="font-medium">Staff roles</p>
        <ul className="space-y-1 text-muted-foreground">
          <li><strong>Kitchen</strong> — Kitchen Display System access. Can update order status (Pending → Ready).</li>
          <li><strong>Waiter</strong> — Cash Counter access. Can create orders from a tablet.</li>
          <li><strong>Manager</strong> — Both Kitchen and Counter access.</li>
        </ul>
      </div>

      <StaffManager initialStaff={serialized} />
    </div>
  );
}
