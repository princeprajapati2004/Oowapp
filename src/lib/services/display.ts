import crypto from "crypto";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { Display, Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import type { OrderEventOrder } from "@/lib/server/order-events";
import {
  getDisplaySettings,
  defaultSettingsForType,
  type DisplayTypeValue,
  type DisplaySettings,
  type DisplayPayload,
  type PublicDisplayOrder,
} from "@/lib/display-types";

export * from "@/lib/display-types";

/**
 * Owner Dashboard "Order Display Management" — configured display boards
 * (TV/kiosk/tablet) that render a live, shop-scoped view of orders. Every
 * display is reached two ways: the owner's authenticated /admin/display UI
 * (manage), and the public, session-less /display/[token] page (view/act).
 * See src/app/api/display/[token]/* for the public surface and
 * src/app/api/admin/displays/* for the management surface. Type/settings
 * constants shared with client components live in src/lib/display-types.ts
 * — this file is server-only (db, crypto) and re-exports them for convenience.
 */

// ─── Token ──────────────────────────────────────────────────────────────────

export function generateDisplayToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── CRUD (owner-only, shop-scoped) ────────────────────────────────────────

export async function listDisplaysForShop(shopId: string): Promise<Display[]> {
  return db.display.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } });
}

export async function getDisplayForShop(shopId: string, id: string): Promise<Display> {
  const display = await db.display.findFirst({ where: { id, shopId } });
  if (!display) throw new NotFoundError("Display not found");
  return display;
}

export async function createDisplay(params: {
  shopId: string;
  name: string;
  type: DisplayTypeValue;
  createdBy: string;
}): Promise<Display> {
  return db.display.create({
    data: {
      shopId: params.shopId,
      name: params.name,
      type: params.type,
      token: generateDisplayToken(),
      settings: defaultSettingsForType(params.type),
      createdBy: params.createdBy,
    },
  });
}

export async function updateDisplay(
  shopId: string,
  id: string,
  patch: { name?: string; isActive?: boolean; allowStaffActions?: boolean; settings?: DisplaySettings }
): Promise<Display> {
  const existing = await getDisplayForShop(shopId, id);
  return db.display.update({
    where: { id: existing.id },
    data: {
      name: patch.name,
      isActive: patch.isActive,
      // allowStaffActions only ever meaningful for KITCHEN — silently ignored
      // (left unchanged) for every other type rather than erroring, since the
      // settings form never shows this toggle for non-kitchen displays.
      allowStaffActions: existing.type === "KITCHEN" ? patch.allowStaffActions : undefined,
      settings: patch.settings,
    },
  });
}

export async function rotateDisplayToken(shopId: string, id: string): Promise<Display> {
  const existing = await getDisplayForShop(shopId, id);
  return db.display.update({ where: { id: existing.id }, data: { token: generateDisplayToken() } });
}

export async function deleteDisplay(shopId: string, id: string): Promise<void> {
  const existing = await getDisplayForShop(shopId, id);
  await db.display.delete({ where: { id: existing.id } });
}

const TERMINAL_STATUSES = new Set<OrderStatus>(["COMPLETED", "DELIVERED", "CANCELLED"]);

/**
 * Builds the snapshot query's where-clause: active statuses always show;
 * terminal statuses (completed/delivered/cancelled) only show for
 * `autoRemoveCompletedMinutes` after they finished — falling back to
 * `createdAt` for any row with no actualReadyAt (cancelled orders, or ones
 * that predate this feature). Order has no `updatedAt` column, so there is
 * no single "last changed" timestamp to sort this by other than these.
 */
export function buildDisplayOrderWhere(shopId: string, statuses: OrderStatus[], settings: DisplaySettings, now: Date): Prisma.OrderWhereInput {
  const activeStatuses = statuses.filter((s) => !TERMINAL_STATUSES.has(s));
  const terminalStatuses = settings.showCompletedOrders && settings.autoRemoveCompletedMinutes > 0 ? statuses.filter((s) => TERMINAL_STATUSES.has(s)) : [];

  const clauses: Prisma.OrderWhereInput[] = [];
  if (activeStatuses.length > 0) clauses.push({ status: { in: activeStatuses } });
  if (terminalStatuses.length > 0) {
    const cutoff = new Date(now.getTime() - settings.autoRemoveCompletedMinutes * 60_000);
    clauses.push({
      status: { in: terminalStatuses },
      OR: [{ actualReadyAt: { gte: cutoff } }, { actualReadyAt: null, createdAt: { gte: cutoff } }],
    });
  }
  // No clause matched (e.g. every status filtered out) — an impossible
  // condition rather than an empty OR, which Prisma/Postgres would read as
  // "no filter at all" and return every order.
  return { shopId, OR: clauses.length > 0 ? clauses : [{ id: "__none__" }] };
}

// ─── Public (token-based) lookup ───────────────────────────────────────────

/** Active-only lookup for the public /display/[token] surface — null (not an error) if invalid/inactive. */
export async function getActiveDisplayByToken(token: string): Promise<Display | null> {
  if (!token) return null;
  const display = await db.display.findUnique({ where: { token } });
  if (!display || !display.isActive) return null;
  return display;
}

/** Fire-and-forget — never awaited by a caller on the request-serving path. */
export function touchDisplayConnection(id: string): void {
  db.display.update({ where: { id }, data: { lastConnectedAt: new Date() } }).catch(() => {});
}

/** Every Display response (admin API + the dashboard page's initial props) goes through this — explicit ISO dates, parsed/defaulted settings, same convention as toOrderEvent(). */
export function toDisplayPayload(display: Display): DisplayPayload {
  const type = display.type as DisplayTypeValue;
  return {
    id: display.id,
    shopId: display.shopId,
    name: display.name,
    type,
    token: display.token,
    isActive: display.isActive,
    allowStaffActions: display.allowStaffActions,
    settings: getDisplaySettings(type, display.settings),
    lastConnectedAt: display.lastConnectedAt ? display.lastConnectedAt.toISOString() : null,
    createdAt: display.createdAt.toISOString(),
  };
}

// ─── Privacy sanitization ──────────────────────────────────────────────────

/**
 * Strips an order down to exactly what `settings` allows before it ever
 * leaves the public API/SSE surface. customerPhone, deliveryAddress and every
 * payment field are ALWAYS omitted here regardless of settings — there is no
 * toggle that can expose them on a public board (spec §2/§13).
 */
export function sanitizeOrderForDisplay(order: OrderEventOrder, settings: DisplaySettings): PublicDisplayOrder {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    id: order.id,
    billNumber: order.billNumber,
    tokenNumber: order.tokenNumber ?? null,
    status: order.status,
    source: order.source ?? "qr",
    customerName: settings.showCustomerName ? order.customerName : null,
    tableNumber: order.tableNumber,
    itemCount,
    items: settings.showItemDetails ? order.items.map((i) => ({ name: i.name, quantity: i.quantity })) : null,
    grandTotal: settings.showAmounts ? order.grandTotal : null,
    notes: order.notes,
    priorityFlag: order.priorityFlag,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt ?? null,
    estimatedReadyAt: settings.showPrepTime ? (order.estimatedReadyAt ?? null) : null,
    actualReadyAt: order.actualReadyAt ?? null,
    prepDelayFlag: order.prepDelayFlag ?? false,
    courierName: order.courierName,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
  };
}
