import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import {
  getDisplayForShop,
  updateDisplay,
  rotateDisplayToken,
  deleteDisplay,
  toDisplayPayload,
  DISPLAY_SETTINGS_SCHEMA,
} from "@/lib/services/display";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    name: z.string().trim().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
    allowStaffActions: z.boolean().optional(),
    settings: DISPLAY_SETTINGS_SCHEMA.optional(),
  }),
  z.object({ action: z.literal("rotate_token") }),
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const display = await getDisplayForShop(session.shopId, id);
    return NextResponse.json(toDisplayPayload(display));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const parsed = patchSchema.parse(await request.json());

    if (parsed.action === "rotate_token") {
      const display = await rotateDisplayToken(session.shopId, id);
      const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
      writeAuditLog({
        action: "DISPLAY_TOKEN_ROTATED",
        actorType: "admin",
        actorId: session.adminId,
        targetType: "display",
        targetId: id,
        shopId: session.shopId,
        metadata: { name: display.name },
        ipAddress,
        userAgent,
        requestId,
      });
      return NextResponse.json(toDisplayPayload(display));
    }

    const display = await updateDisplay(session.shopId, id, {
      name: parsed.name,
      isActive: parsed.isActive,
      allowStaffActions: parsed.allowStaffActions,
      settings: parsed.settings,
    });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "DISPLAY_UPDATED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "display",
      targetId: id,
      shopId: session.shopId,
      metadata: { name: display.name, isActive: display.isActive, allowStaffActions: display.allowStaffActions },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(toDisplayPayload(display));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const display = await getDisplayForShop(session.shopId, id);
    await deleteDisplay(session.shopId, id);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "DISPLAY_DELETED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "display",
      targetId: id,
      shopId: session.shopId,
      metadata: { name: display.name, type: display.type },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
