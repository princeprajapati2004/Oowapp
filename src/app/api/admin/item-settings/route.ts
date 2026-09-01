import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getOrCreateItemSettings, updateItemSettings } from "@/lib/services/item-settings";
import { itemSettingsSchema } from "@/lib/validation/item-settings";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const settings = await getOrCreateItemSettings(session.shopId);
    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const data = itemSettingsSchema.parse(body);
    const settings = await updateItemSettings(session.shopId, data);
    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error);
  }
}
