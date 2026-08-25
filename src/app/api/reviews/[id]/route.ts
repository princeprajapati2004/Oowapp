import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/customer-session";
import { handleApiError } from "@/lib/api-utils";
import { updateReviewSchema } from "@/lib/validation/review";
import { updateReview } from "@/lib/services/review";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCustomerSession();
    const { id } = await params;
    const body = await request.json();
    const input = updateReviewSchema.parse(body);
    const review = await updateReview(session.shopId, session.customerId, id, input);
    return NextResponse.json(review);
  } catch (error) {
    return handleApiError(error);
  }
}
