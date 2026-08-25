"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Star, MessageSquareText, EyeOff, Eye, Reply } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { listOwnerReviews, getShopRatingSummary } from "@/lib/services/review";

type ReviewRow = Awaited<ReturnType<typeof listOwnerReviews>>[number];
type RatingSummary = Awaited<ReturnType<typeof getShopRatingSummary>>;

const RATING_FILTERS = [0, 5, 4, 3, 2, 1] as const;
type SortValue = "newest" | "highest" | "lowest";
const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest rating" },
  { value: "lowest", label: "Lowest rating" },
];

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-3.5", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  onUpdated,
}: {
  review: ReviewRow;
  onUpdated: (review: ReviewRow) => void;
}) {
  const [response, setResponse] = useState(review.ownerResponse ?? "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleReply() {
    setSaving(true);
    try {
      const updated = await api.patch<ReviewRow>(`/api/admin/reviews/${review.id}`, {
        action: "respond",
        response,
      });
      onUpdated(updated);
      toast.success("Reply saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save reply");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    setToggling(true);
    try {
      const nextStatus = review.status === "ACTIVE" ? "HIDDEN" : "ACTIVE";
      const updated = await api.patch<ReviewRow>(`/api/admin/reviews/${review.id}`, {
        action: "status",
        status: nextStatus,
      });
      onUpdated(updated);
      toast.success(nextStatus === "HIDDEN" ? "Review hidden from your store" : "Review is visible again");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update review");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <StarRow rating={review.rating} />
            {review.status === "HIDDEN" && (
              <Badge variant="outline" className="text-[11px] text-muted-foreground">
                Hidden
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {review.reviewerName} · Order {review.billNumber} ·{" "}
            {new Date(review.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={handleToggleStatus}
          disabled={toggling}
        >
          {review.status === "ACTIVE" ? (
            <>
              <EyeOff className="size-3.5" /> Hide
            </>
          ) : (
            <>
              <Eye className="size-3.5" /> Unhide
            </>
          )}
        </Button>
      </div>

      {review.reviewText && <p className="text-sm">{review.reviewText}</p>}

      <div className="space-y-2 border-t pt-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Reply className="size-3.5" /> Your response
        </p>
        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value.slice(0, 500))}
          placeholder="Reply to this customer…"
          rows={2}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleReply} disabled={saving}>
            {saving ? "Saving…" : review.ownerResponse ? "Update Reply" : "Post Reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReviewsManager({
  initialReviews,
  summary,
}: {
  initialReviews: ReviewRow[];
  summary: RatingSummary;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<(typeof RATING_FILTERS)[number]>(0);
  const [sort, setSort] = useState<SortValue>("newest");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = reviews.filter((r) => {
      const matchesSearch =
        !q ||
        r.billNumber.toLowerCase().includes(q) ||
        r.reviewerName.toLowerCase().includes(q) ||
        (r.reviewText ?? "").toLowerCase().includes(q);
      const matchesRating = ratingFilter === 0 || r.rating === ratingFilter;
      return matchesSearch && matchesRating;
    });
    return [...base].sort((a, b) => {
      if (sort === "highest") return b.rating - a.rating;
      if (sort === "lowest") return a.rating - b.rating;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [reviews, search, ratingFilter, sort]);

  function handleUpdated(updated: ReviewRow) {
    setReviews((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
        <p className="text-muted-foreground">Customer ratings & feedback for your store.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold">{summary.average.toFixed(1)}</div>
          <div className="space-y-0.5">
            <StarRow rating={Math.round(summary.average)} />
            <p className="text-xs text-muted-foreground">{summary.count} rating{summary.count === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="flex flex-1 min-w-[200px] flex-col gap-1">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = summary.distribution[n as 1 | 2 | 3 | 4 | 5] ?? 0;
            const pct = summary.count ? Math.round((c / summary.count) * 100) : 0;
            return (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 text-muted-foreground">{n}</span>
                <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-muted-foreground">{c}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order, customer, or review text…"
            className="pl-10 h-10 rounded-full bg-muted/50 border-transparent focus:border-input focus:bg-background transition-colors"
          />
        </div>
        <Select value={String(ratingFilter)} onValueChange={(v) => setRatingFilter(Number(v) as (typeof RATING_FILTERS)[number])}>
          <SelectTrigger className="w-36 h-10">
            <SelectValue>{ratingFilter === 0 ? "All ratings" : `${ratingFilter} ★`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RATING_FILTERS.map((f) => (
              <SelectItem key={f} value={String(f)}>
                {f === 0 ? "All ratings" : `${f} ★`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort((v as SortValue) ?? "newest")}>
          <SelectTrigger className="w-40 h-10">
            <SelectValue>{SORT_OPTIONS.find((s) => s.value === sort)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={reviews.length === 0 ? "No reviews yet" : "No reviews found"}
          description={
            reviews.length === 0
              ? "Customer ratings will show up here once they rate a completed order."
              : "Try a different search or filter."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => (
            <ReviewCard key={review.id} review={review} onUpdated={handleUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}
