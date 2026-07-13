import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getShopById, updateShopSettings } from "@/lib/services/shop";
import {
  businessInfoSchema,
  paymentSettingsSchema,
  orderSettingsSchema,
} from "@/lib/validation/shop-settings";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const shop = await getShopById(session.shopId);
    return NextResponse.json(shop);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminSession();
    const { section, ...rest } = await request.json();

    let data;
    if (section === "business") data = businessInfoSchema.parse(rest);
    else if (section === "payment") data = paymentSettingsSchema.parse(rest);
    else if (section === "orders") data = orderSettingsSchema.parse(rest);
    else return NextResponse.json({ error: "Unknown settings section" }, { status: 400 });

    const shop = await updateShopSettings(session.shopId, data);
    return NextResponse.json(shop);
  } catch (error) {
    return handleApiError(error);
  }
}
