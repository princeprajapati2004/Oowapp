import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_SIZE = 4 * 1024 * 1024;

// Magic-byte signatures for the raster formats we actually want to accept —
// client-supplied `file.type` is just a header the caller can set to
// anything, so it's not trusted on its own. SVG is deliberately excluded:
// it's XML that can carry <script>, which would be a stored-XSS vector if
// ever rendered outside an <img> context.
const SIGNATURES: { type: string; bytes: number[] }[] = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"; WEBP marker follows at offset 8
];

function sniffImageType(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => buffer[i] === b)) {
      if (sig.type === "image/webp") {
        return buffer.subarray(8, 12).toString("ascii") === "WEBP" ? sig.type : null;
      }
      return sig.type;
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Image must be smaller than 4MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!sniffImageType(buffer)) {
      return NextResponse.json(
        { error: "File content doesn't match a supported image format (JPEG, PNG, GIF, WEBP)" },
        { status: 400 }
      );
    }

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: `shops/${session.shopId}`, resource_type: "image" },
          (error, result) => {
            if (error || !result) reject(error ?? new Error("Upload failed"));
            else resolve(result as { secure_url: string });
          }
        )
        .end(buffer);
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (error) {
    return handleApiError(error);
  }
}
