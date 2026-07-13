import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { productSchema } from "@/lib/validation/product";
import { listProducts, createProduct } from "@/lib/services/product";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const products = await listProducts(session.shopId);
    return NextResponse.json(products);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = productSchema.parse(body);
    const product = await createProduct(session.shopId, input);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
