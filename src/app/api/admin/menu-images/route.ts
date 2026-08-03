import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

const createSchema = z.object({
  url: z.string().trim().min(1, "URL is required"),
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function GET() {
  try {
    const session = await requireAdminSession();
    const images = await db.menuImage.findMany({
      where: { shopId: session.shopId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(images);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = createSchema.parse(body);
    const image = await db.menuImage.create({ data: { shopId: session.shopId, ...input } });
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
