import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { listDisplaysForShop, createDisplay, toDisplayPayload, DISPLAY_TYPES } from "@/lib/services/display";

const createDisplaySchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(DISPLAY_TYPES),
});

export async function GET() {
  try {
    const session = await requireAdminSession();
    const displays = await listDisplaysForShop(session.shopId);
    return NextResponse.json({ displays: displays.map(toDisplayPayload) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();

    if (!checkRateLimit(`displays:create:${session.shopId}`, 20, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const input = createDisplaySchema.parse(await request.json());
    const display = await createDisplay({
      shopId: session.shopId,
      name: input.name,
      type: input.type,
      createdBy: session.adminId,
    });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "DISPLAY_CREATED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "display",
      targetId: display.id,
      shopId: session.shopId,
      metadata: { name: display.name, type: display.type },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(display, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
