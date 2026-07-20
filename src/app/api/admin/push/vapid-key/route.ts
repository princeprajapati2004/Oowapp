import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await requireAdminSession();
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
    return NextResponse.json({ publicKey });
  } catch (error) {
    return handleApiError(error);
  }
}
