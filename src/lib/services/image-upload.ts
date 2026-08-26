import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

// Same magic-byte sniffing as src/app/api/upload/route.ts (client-supplied
// file.type is just a header, not trusted on its own) — duplicated rather
// than imported so the existing owner-only upload route stays untouched;
// shared here for the two new return-evidence upload routes only.
const SIGNATURES: { type: string; bytes: number[] }[] = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"; WEBP marker follows at offset 8
];

export function sniffImageType(buffer: Buffer): string | null {
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

export function uploadImageToCloudinary(buffer: Buffer, folder: string): Promise<{ secure_url: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: "image" }, (error, result) => {
        if (error || !result) reject(error ?? new Error("Upload failed"));
        else resolve(result as { secure_url: string });
      })
      .end(buffer);
  });
}
