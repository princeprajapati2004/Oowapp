import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

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
      },
    });
    return NextResponse.json(staff);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = createStaffSchema.parse(body);

    const passwordHash = await hashPassword(input.password);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = await (db as any).staffMember.create({
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

    return NextResponse.json(staff, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
