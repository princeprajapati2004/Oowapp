import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/customer-session";
import { handleApiError } from "@/lib/api-utils";
import { createReviewSchema } from "@/lib/validation/review";
import { createReview } from "@/lib/services/review";

export async function POST(request: Request) {
  try {
    const session = await requireCustomerSession();
    const body = await request.json();
    const input = createReviewSchema.parse(body);
    const review = await createReview(session.shopId, session.customerId, input);
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
