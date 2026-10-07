import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { createCheckoutOrderSchema } from "@/lib/validation/subscription-checkout";
import { createCheckoutOrder } from "@/lib/services/subscription-checkout";

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = createCheckoutOrderSchema.parse(body);
    const result = await createCheckoutOrder(session.adminId, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
