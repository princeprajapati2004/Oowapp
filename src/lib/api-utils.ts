import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/session";
import { BillAlreadyRequestedError } from "@/lib/services/table-session";

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message = "Already exists") {
    super(message);
    this.name = "ConflictError";
  }
}

// Distinct from a generic Error so its message reaches the client instead of
// being masked as "Something went wrong" by the generic Error branch below.
export class InvalidCouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCouponError";
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof BillAlreadyRequestedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof InvalidCouponError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof Error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 400 });
  }
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
