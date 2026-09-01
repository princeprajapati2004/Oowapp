import { NextResponse } from "next/server";
import { requireShopActor } from "@/lib/shop-actor";
import { handleApiError } from "@/lib/api-utils";
import { MAX_IMAGE_SIZE, sniffImageType, uploadImageToCloudinary } from "@/lib/services/image-upload";

export async function POST(request: Request) {
  try {
    const actor = await requireShopActor();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "Image must be smaller than 4MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!sniffImageType(buffer)) {
      return NextResponse.json(
        { error: "File content doesn't match a supported image format (JPEG, PNG, GIF, WEBP)" },
        { status: 400 }
      );
    }

    const result = await uploadImageToCloudinary(buffer, `shops/${actor.shopId}/loss-damage`);
    return NextResponse.json({ url: result.secure_url });
  } catch (error) {
    return handleApiError(error);
  }
}
