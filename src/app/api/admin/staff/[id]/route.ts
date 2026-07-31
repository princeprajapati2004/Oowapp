import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const updateStaffSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(100).optional(),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  role: z.enum(["MANAGER", "KITCHEN", "WAITER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(100).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = updateStaffSchema.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (db as any).staffMember.findFirst({
      where: { id, shopId: session.shopId },
    });
    if (!existing) throw new NotFoundError("Staff member not found");

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone || null;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password) data.passwordHash = await hashPassword(input.password);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (db as any).staffMember.update({
      where: { id },
      data,
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

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (db as any).staffMember.findFirst({
      where: { id, shopId: session.shopId },
    });
    if (!existing) throw new NotFoundError("Staff member not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).staffMember.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
