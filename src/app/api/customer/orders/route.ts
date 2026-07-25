import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-session";
import { toOrderEvent } from "@/lib/server/order-events";

// Authoritative, cross-device order history for a logged-in customer —
// the counterpart to the device-local (localStorage) history guests get.
export async function GET() {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orders = await db.order.findMany({
    where: { customerId: session.customerId, shopId: session.shopId },
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: 100,
  });

  return NextResponse.json({ orders: orders.map(toOrderEvent) });
}
