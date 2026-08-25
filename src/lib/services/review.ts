import { db } from "@/lib/db";
import { NotFoundError, ConflictError } from "@/lib/api-utils";

// No existing convention in this codebase for showing a customer's identity
// to anyone other than themselves or the shop owner — this is a new, minimal
// rule: first name + last initial, single-word names as-is, and the "Guest"
// placeholder new accounts get (see findOrCreatePartyForOrder) shown as
// "Verified Customer" instead. Never the phone number.
export function safeReviewerName(name: string): string {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.toLowerCase() === "guest") return "Verified Customer";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

export async function createReview(
  shopId: string,
  customerId: string,
  input: { orderId: string; rating: number; reviewText?: string }
) {
  // Scoping the lookup to {id, shopId, customerId} in one query both
  // verifies the order is genuinely this customer's AND belongs to this
  // shop — a client can't submit a review against an order it doesn't own
  // or that lives in a different shop by just guessing an orderId.
  const order = await db.order.findFirst({ where: { id: input.orderId, shopId, customerId } });
  if (!order) throw new NotFoundError("Order not found");
  if (order.status !== "COMPLETED") {
    throw new ConflictError("You can rate this order once it's completed.");
  }

  try {
    return await db.review.create({
      data: {
        shopId,
        customerId,
        orderId: input.orderId,
        rating: input.rating,
        reviewText: input.reviewText || null,
      },
    });
  } catch (error) {
    // orderId is @unique — a second submission for the same order hits this
    // race/duplicate path, the real "one review per order" enforcement
    // (not just a disabled button).
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new ConflictError("You've already reviewed this order.");
    }
    throw error;
  }
}

export async function updateReview(
  shopId: string,
  customerId: string,
  reviewId: string,
  input: { rating: number; reviewText?: string }
) {
  const review = await db.review.findFirst({ where: { id: reviewId, shopId, customerId } });
  if (!review) throw new NotFoundError("Review not found");
  return db.review.update({
    where: { id: reviewId },
    data: { rating: input.rating, reviewText: input.reviewText || null },
  });
}

const EMPTY_DISTRIBUTION: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

// Always computed live from actual rows — never a stored/cached field on
// Shop — so there's exactly one source of truth for a store's rating.
export async function getShopRatingSummary(shopId: string) {
  const reviews = await db.review.findMany({ where: { shopId, status: "ACTIVE" }, select: { rating: true } });
  const count = reviews.length;
  if (count === 0) return { average: 0, count: 0, distribution: { ...EMPTY_DISTRIBUTION } };

  const distribution = { ...EMPTY_DISTRIBUTION };
  let sum = 0;
  for (const r of reviews) {
    sum += r.rating;
    const bucket = r.rating as 1 | 2 | 3 | 4 | 5;
    if (bucket in distribution) distribution[bucket] += 1;
  }
  return { average: Math.round((sum / count) * 10) / 10, count, distribution };
}

// Public-facing list — deliberately a narrow, hand-built shape (never a raw
// Prisma row) so a customer's phone/email can never leak into this response
// no matter what fields get added to Customer later.
export async function listShopReviews(shopId: string) {
  const reviews = await db.review.findMany({
    where: { shopId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } } },
  });
  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    reviewText: r.reviewText,
    ownerResponse: r.ownerResponse,
    ownerResponseAt: r.ownerResponseAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    reviewerName: safeReviewerName(r.customer.name),
  }));
}

// Owner-facing — includes HIDDEN reviews and the order reference, still
// never the customer's phone/email.
export async function listOwnerReviews(shopId: string) {
  const reviews = await db.review.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } }, order: { select: { billNumber: true } } },
  });
  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    reviewText: r.reviewText,
    status: r.status,
    ownerResponse: r.ownerResponse,
    ownerResponseAt: r.ownerResponseAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    reviewerName: safeReviewerName(r.customer.name),
    billNumber: r.order.billNumber,
  }));
}

export async function respondToReview(shopId: string, reviewId: string, response: string) {
  const review = await db.review.findFirst({ where: { id: reviewId, shopId } });
  if (!review) throw new NotFoundError("Review not found");
  return db.review.update({
    where: { id: reviewId },
    data: { ownerResponse: response.trim() || null, ownerResponseAt: response.trim() ? new Date() : null },
  });
}

export async function setReviewStatus(shopId: string, reviewId: string, status: "ACTIVE" | "HIDDEN") {
  const review = await db.review.findFirst({ where: { id: reviewId, shopId } });
  if (!review) throw new NotFoundError("Review not found");
  return db.review.update({ where: { id: reviewId }, data: { status } });
}
