import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { publishOrderEvent, type KotEventPayload } from "@/lib/server/order-events";

const patchSchema = z.object({
  status: z.enum(["PENDING", "PREPARING", "READY", "SERVED", "CANCELLED"]),
});

const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = patchSchema.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ticket = await (db as any).kitchenTicket.findFirst({
      where: { id, shopId: session.shopId },
    });
    if (!ticket) throw new NotFoundError("Kitchen ticket not found");

    const allowed = STATUS_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(input.status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${ticket.status} to ${input.status}` },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (db as any).kitchenTicket.update({
      where: { id },
      data: { status: input.status },
      include: {
        items: true,
        tableSession: { select: { tableNumber: true } },
      },
    });

    const kotPayload: KotEventPayload = {
      id: updated.id,
      shopId: updated.shopId,
      tableSessionId: updated.tableSessionId,
      kotNumber: updated.kotNumber,
      status: updated.status,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
      tableSession: { tableNumber: updated.tableSession.tableNumber },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: updated.items.map((i: any) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        quantity: i.quantity,
        notes: i.notes,
      })),
    };
    publishOrderEvent(session.shopId, { type: "kot.updated", kot: kotPayload });

    return NextResponse.json({
      ok: true,
      status: updated.status,
      kitchenTicketId: updated.id,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ticket = await (db as any).kitchenTicket.findFirst({
      where: { id, shopId: session.shopId },
      include: {
        items: { include: { product: { select: { imageUrl: true, name: true } } } },
        staff: { select: { id: true, name: true } },
        tableSession: { select: { tableNumber: true, customerName: true } },
      },
    });
    if (!ticket) throw new NotFoundError("Kitchen ticket not found");

    return NextResponse.json({
      ...ticket,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: ticket.items.map((i: any) => ({ ...i, price: Number(i.price) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
