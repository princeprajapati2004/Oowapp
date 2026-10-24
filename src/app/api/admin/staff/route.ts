import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { assertFeatureEnabled } from "@/lib/services/feature-permission";
import { checkSubscriptionLimit, assertLimitNotExceededInTx } from "@/lib/services/subscription-limits";
import { handleApiError } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(100),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  role: z.enum(["MANAGER", "KITCHEN", "WAITER"]),
  password: z.string().min(6).max(100),
});

export async function GET() {
  try {
    const session = await requireAdminSession();
    await assertFeatureEnabled(session.shopId, "multi_staff");
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
    const withOrderCount = staff.map(({ _count, ...s }: any) => ({ ...s, orderCount: _count.orders }));
    return NextResponse.json(withOrderCount);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    await assertFeatureEnabled(session.shopId, "multi_staff");
    const { limit, planName } = await checkSubscriptionLimit(session.adminId, "USERS", 1);
    const body = await request.json();
    const input = createStaffSchema.parse(body);

    const passwordHash = await hashPassword(input.password);

    // Recheck atomically, immediately before the insert — see the matching
    // comment in api/admin/products/route.ts. USERS counts the owner (+1,
    // mirroring getUsageSnapshot) plus every staff member across all shops.
    const staff = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertLimitNotExceededInTx(tx, session.adminId, "USERS", limit, planName, 1, async (tx) => {
        const shops = await tx.shop.findMany({ where: { adminId: session.adminId }, select: { id: true } });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const staffCount = await (tx as any).staffMember.count({ where: { shopId: { in: shops.map((s) => s.id) } } });
        return staffCount + 1;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (tx as any).staffMember.create({
        data: {
          shopId: session.shopId,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          role: input.role,
          passwordHash,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
    });

    return NextResponse.json({ ...staff, orderCount: 0 }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
