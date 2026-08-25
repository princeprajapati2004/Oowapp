import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { respondToReview, setReviewStatus } from "@/lib/services/review";

const updateReviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("respond"), response: z.string().trim().max(500) }),
  z.object({ action: z.literal("status"), status: z.enum(["ACTIVE", "HIDDEN"]) }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateReviewActionSchema.parse(body);

    const review =
      parsed.action === "respond"
        ? await respondToReview(session.shopId, id, parsed.response)
        : await setReviewStatus(session.shopId, id, parsed.status);

    return NextResponse.json(review);
  } catch (error) {
    return handleApiError(error);
  }
}
