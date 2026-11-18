import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listTermsVersions, publishTermsVersion } from "@/lib/services/subscription-terms";

const publishTermsSchema = z.object({
  content: z.string().trim().min(1, "Terms content is required").max(20000),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdminSession();
    const { id } = await params;
    const versions = await listTermsVersions(id);
    return NextResponse.json(versions);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = publishTermsSchema.parse(body);
    const version = await publishTermsVersion(id, input.content, session.superAdminId);
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
