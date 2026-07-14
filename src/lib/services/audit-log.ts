import { db } from "@/lib/db";
import { Prisma, type AuditAction } from "@/generated/prisma/client";

export interface WriteAuditLogInput {
  action: AuditAction;
  actorType: "admin" | "super_admin" | "system";
  actorId: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  shopId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

// Never throws — audit failures must not crash the main request flow.
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: input.action,
        actorType: input.actorType,
        actorId: input.actorId,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as Prisma.InputJsonValue ?? undefined,
        shopId: input.shopId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
    });
  } catch {
    // Silently swallow — observability failure must not break business logic
  }
}

export function extractRequestMeta(request: Request): {
  ipAddress: string | undefined;
  userAgent: string | undefined;
  requestId: string;
} {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const requestId = crypto.randomUUID();
  return { ipAddress, userAgent, requestId };
}
