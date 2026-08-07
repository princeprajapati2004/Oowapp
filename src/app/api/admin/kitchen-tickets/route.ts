import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { publishOrderEvent, type KotEventPayload } from "@/lib/server/order-events";
import { sendNewOrderNotification } from "@/lib/services/push";
import { createNotification } from "@/lib/services/notification";
import { OPEN_STATUSES, resolveOrCreateSession } from "@/lib/services/table-session";

const kotItemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1),
  price: z.number().min(0),
  quantity: z.number().int().positive(),
  notes: z.string().trim().max(200).optional(),
});

const createKotSchema = z.object({
  // Either provide an existing tableSessionId OR a tableNumber to auto-create/find a session
  tableSessionId: z.string().optional(),
  tableNumber: z.string().trim().min(1).max(50).optional(),
  customerName: z.string().trim().max(100).optional(),
  items: z.array(kotItemSchema).min(1, "At least one item is required"),
  notes: z.string().trim().max(300).optional(),
}).refine((d) => d.tableSessionId || d.tableNumber, {
  message: "Either tableSessionId or tableNumber is required",
});

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const url = new URL(request.url);
    const tableSessionId = url.searchParams.get("tableSessionId");
    const statusFilter = url.searchParams.get("status");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tickets = await (db as any).kitchenTicket.findMany({
      where: {
        shopId: session.shopId,
        ...(tableSessionId ? { tableSessionId } : {}),
        ...(statusFilter ? { status: statusFilter as "PENDING" | "PREPARING" | "READY" | "SERVED" | "CANCELLED" } : {}),
      },
      include: {
        items: { include: { product: { select: { imageUrl: true } } } },
        staff: { select: { id: true, name: true } },
        tableSession: { select: { tableNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tickets as any[]).map((t: any) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: t.items.map((i: any) => ({
          ...i,
          price: Number(i.price),
        })),
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = createKotSchema.parse(body);

    // Resolve or create a table session
    let tableSession;
    if (input.tableSessionId) {
      tableSession = await db.tableSession.findFirst({
        where: { id: input.tableSessionId, shopId: session.shopId, status: { in: [...OPEN_STATUSES] } },
      });
      if (!tableSession) throw new NotFoundError("Table session not found or already closed");
    } else {
      // Auto-create or find existing session for the given table number
      tableSession = await db.$transaction((tx) =>
        resolveOrCreateSession(tx, {
          shopId: session.shopId,
          tableNumber: input.tableNumber!,
          customerName: input.customerName,
        })
      );
    }

    // Sequential KOT number within this session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingCount = await (db as any).kitchenTicket.count({
      where: { tableSessionId: input.tableSessionId },
    });
    const kotNumber = existingCount + 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ticket = await (db as any).kitchenTicket.create({
      data: {
        shopId: session.shopId,
        tableSessionId: input.tableSessionId,
        kotNumber,
        notes: input.notes ?? null,
        staffId: null, // set from staff session if available in future
        items: {
          create: input.items.map((item) => ({
            productId: item.productId ?? null,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            notes: item.notes ?? null,
          })),
        },
      },
      include: {
        items: true,
        tableSession: { select: { tableNumber: true } },
      },
    });

    const itemCount = input.items.reduce((s, i) => s + i.quantity, 0);

    // Notify kitchen (fire-and-forget)
    createNotification(session.shopId, {
      type: "NEW_ORDER",
      title: `KOT #${kotNumber} — Table ${tableSession.tableNumber}`,
      body: `${itemCount} item${itemCount === 1 ? "" : "s"} sent to kitchen`,
      link: "/admin/kitchen",
    }).catch(() => {});

    sendNewOrderNotification(session.shopId, {
      billNumber: `KOT-${kotNumber}`,
      customerName: tableSession.customerName ?? undefined,
      grandTotal: input.items.reduce((s, i) => s + i.price * i.quantity, 0),
      currency: "INR",
      orderId: ticket.id,
    }).catch(() => {});

    // Publish KOT event so kitchen display updates live
    const kotPayload: KotEventPayload = {
      id: ticket.id,
      shopId: ticket.shopId,
      tableSessionId: ticket.tableSessionId,
      kotNumber: ticket.kotNumber,
      status: ticket.status,
      notes: ticket.notes,
      createdAt: ticket.createdAt.toISOString(),
      tableSession: { tableNumber: ticket.tableSession.tableNumber },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: ticket.items.map((i: any) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        quantity: i.quantity,
        notes: i.notes,
      })),
    };
    publishOrderEvent(session.shopId, { type: "kot.created", kot: kotPayload });

    return NextResponse.json(
      {
        ok: true,
        kitchenTicketId: ticket.id,
        kotNumber: ticket.kotNumber,
        tableNumber: ticket.tableSession.tableNumber,
        sessionId: tableSession.id,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
