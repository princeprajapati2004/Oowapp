import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { categorySchema } from "@/lib/validation/category";
import { listCategories, createCategory } from "@/lib/services/category";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const categories = await listCategories(session.shopId);
    return NextResponse.json(categories);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = categorySchema.parse(body);
    const category = await createCategory(session.shopId, input);
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
