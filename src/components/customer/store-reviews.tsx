"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquareText, Star } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

export type PublicReview = {
  id: string;
  rating: number;
  reviewText: string | null;
  ownerResponse: string | null;
  ownerResponseAt: string | null;
  createdAt: string;
  reviewerName: string;
};

export type RatingSummary = {
  average: number;
  count: number;
  distribution: Record<number, number>;
};

const RATING_FILTERS = [0, 5, 4, 3, 2, 1] as const;
type SortOption = "newest" | "highest" | "lowest";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest Rating" },
  { value: "lowest", label: "Lowest Rating" },
];

function StarRow({ rating, size = "size-4" }: { rating: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(size, n <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  );
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function StoreReviews({
  slug,
  businessName,
  summary,
  reviews,
}: {
  slug: string;
  businessName: string;
  summary: RatingSummary;
  reviews: PublicReview[];
}) {
  const [filter, setFilter] = useState<(typeof RATING_FILTERS)[number]>(0);
  const [sort, setSort] = useState<SortOption>("newest");

  const filtered = useMemo(() => {
    const base = filter === 0 ? reviews : reviews.filter((r) => r.rating === filter);
    return [...base].sort((a, b) => {
      if (sort === "highest") return b.rating - a.rating;
      if (sort === "lowest") return a.rating - b.rating;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [reviews, filter, sort]);

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/order/${slug}`}
            aria-label="Back to menu"
            className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Customer Reviews</h1>
            <p className="truncate text-sm text-muted-foreground">{businessName}</p>
          </div>
        </div>

        {summary.count === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="No reviews yet"
            description="Be the first customer to share your experience."
          />
        ) : (
          <>
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold">{summary.average.toFixed(1)}</div>
                <div className="space-y-0.5">
                  <StarRow rating={summary.average} />
                  <p className="text-xs text-muted-foreground">{summary.count} rating{summary.count === 1 ? "" : "s"}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = summary.distribution[n] ?? 0;
                  const pct = summary.count ? Math.round((c / summary.count) * 100) : 0;
                  return (
                    <div key={n} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 text-muted-foreground">{n}</span>
                      <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-muted-foreground">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {RATING_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === f ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {f === 0 ? "All" : `${f} ★`}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSort(s.value)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    sort === s.value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="space-y-2.5">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No reviews match this filter.</p>
              ) : (
                filtered.map((r) => (
                  <div key={r.id} className="space-y-1.5 rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <StarRow rating={r.rating} size="size-3.5" />
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                    </div>
                    {r.reviewText && <p className="text-sm">{r.reviewText}</p>}
                    <p className="text-xs text-muted-foreground">— {r.reviewerName}</p>
                    {r.ownerResponse && (
                      <div className="mt-2 rounded-lg bg-muted/50 p-2.5 text-xs">
                        <p className="mb-0.5 font-medium">Response from {businessName}</p>
                        <p className="text-muted-foreground">{r.ownerResponse}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
