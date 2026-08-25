"use client";

import { useState } from "react";
import { Star, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api-client";

const RATING_LABELS: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Average",
  4: "Good",
  5: "Excellent",
};

const MAX_LENGTH = 500;

export type OrderReview = { id: string; rating: number; reviewText: string | null };

export function RateOrderWidget({
  orderId,
  businessName,
  review,
  onSaved,
}: {
  orderId: string;
  businessName: string;
  review: OrderReview | null | undefined;
  onSaved: (review: OrderReview) => void;
}) {
  const [editing, setEditing] = useState(!review);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState(review?.reviewText ?? "");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setRating(review?.rating ?? 0);
    setReviewText(review?.reviewText ?? "");
    setEditing(true);
  }

  async function handleSubmit() {
    if (rating < 1) {
      toast.error("Please tap a star to rate your experience");
      return;
    }
    setSaving(true);
    try {
      const body = { rating, reviewText: reviewText.trim() || undefined };
      const saved = review
        ? await api.put<OrderReview>(`/api/reviews/${review.id}`, body)
        : await api.post<OrderReview>("/api/reviews", { orderId, ...body });
      onSaved(saved);
      setEditing(false);
      toast.success(review ? "Review updated" : "Thanks for your feedback!");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save your review — please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing && review) {
    return (
      <div className="rounded-2xl border bg-card p-5 space-y-3 print:hidden">
        <p className="text-sm font-semibold">Your Rating</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("size-5", n <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
          ))}
        </div>
        {review.reviewText && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Your Review</p>
            <p className="text-sm">{review.reviewText}</p>
          </div>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
          <Pencil className="size-3.5" /> Edit Review
        </Button>
      </div>
    );
  }

  const displayRating = hoverRating || rating;

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4 print:hidden">
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold">How was your experience?</p>
        <p className="text-xs text-muted-foreground">{businessName}</p>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? "" : "s"} — ${RATING_LABELS[n]}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-0.5 transition-transform active:scale-90"
            >
              <Star className={cn("size-8", n <= displayRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-muted-foreground h-4">
          {displayRating > 0 ? `${displayRating} — ${RATING_LABELS[displayRating]}` : "Tap a star to rate"}
        </p>
      </div>

      <div className="space-y-1">
        <Textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Share your experience with this store"
          rows={3}
          maxLength={MAX_LENGTH}
        />
        <p className="text-right text-[11px] text-muted-foreground">{reviewText.length}/{MAX_LENGTH}</p>
      </div>

      <div className="flex gap-2">
        {review && (
          <Button variant="outline" className="flex-1" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button className="flex-1" onClick={handleSubmit} disabled={saving || rating < 1}>
          {saving ? "Saving…" : review ? "Save Review" : "Submit Review"}
        </Button>
      </div>
    </div>
  );
}
