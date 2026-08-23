"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Gift, Copy, Share2, Users, Clock, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils/currency";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11a16.5 16.5 0 0 1-1.62-.6c-2.85-1.23-4.7-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.93s.73-2.08.99-2.36c.26-.28.56-.35.75-.35h.53c.17 0 .4-.03.62.47.24.55.8 1.9.87 2.04.07.14.11.3.02.49-.09.19-.14.3-.28.46-.14.16-.29.36-.42.48-.14.13-.28.28-.12.55.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.18-.28.36-.23.6-.14.24.09 1.55.73 1.81.86.26.14.44.2.5.32.06.12.06.68-.18 1.36Z" />
    </svg>
  );
}

type ReferralRow = {
  id: string;
  referredName: string;
  status: "PENDING" | "REWARDED";
  rewardAmount: number | null;
  createdAt: string;
};

export function ReferPage({
  slug,
  businessName,
  currency,
  code,
  totalEarned,
  programEnabled,
  rewardAmount,
  referrals,
}: {
  slug: string;
  businessName: string;
  currency: string;
  code: string;
  totalEarned: number;
  programEnabled: boolean;
  rewardAmount: number;
  referrals: ReferralRow[];
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const referralUrl = typeof window !== "undefined" ? `${window.location.origin}/order/${slug}?ref=${code}` : `/order/${slug}?ref=${code}`;
  const shareMessage = `Join ${businessName} using my referral link and get started with Oowapp: ${referralUrl}`;

  async function copyToClipboard(text: string, onDone: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      onDone();
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — please copy it manually");
    }
  }

  async function handleShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `Refer ${businessName}`, text: shareMessage });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error("Couldn't share the link");
        }
      }
    } else {
      copyToClipboard(referralUrl, () => setCopiedLink(true));
    }
  }

  function handleWhatsAppShare() {
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const pendingCount = referrals.filter((r) => r.status === "PENDING").length;
  const rewardedCount = referrals.filter((r) => r.status === "REWARDED").length;

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/order/${slug}`}
            aria-label="Back to menu"
            className="flex size-9 items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="size-4.5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Refer & Earn</h1>
            <p className="text-sm text-muted-foreground">{businessName}</p>
          </div>
        </div>

        {!programEnabled ? (
          <EmptyState
            icon={Gift}
            title="Referrals aren't active right now"
            description="This store hasn't turned on referral rewards yet — check back later."
          />
        ) : (
          <>
            <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Gift className="size-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Share your code — earn</p>
                <p className="text-2xl font-bold tracking-tight">{formatCurrency(rewardAmount, currency)}</p>
                <p className="text-xs text-muted-foreground">for every friend who orders</p>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-xl border bg-muted/40 px-4 py-2.5">
                <span className="font-mono font-bold tracking-widest text-lg">{code}</span>
                <button
                  type="button"
                  aria-label="Copy referral code"
                  onClick={() => copyToClipboard(code, () => setCopiedCode(true))}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="size-4" />
                </button>
              </div>
              {copiedCode && <p className="text-xs text-emerald-600 dark:text-emerald-400">Code copied</p>}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" className="h-10" onClick={() => copyToClipboard(referralUrl, () => setCopiedLink(true))}>
                  <Copy className="size-4" /> {copiedLink ? "Copied!" : "Copy link"}
                </Button>
                <Button variant="outline" className="h-10" onClick={handleShare}>
                  <Share2 className="size-4" /> Share
                </Button>
              </div>
              <Button
                className="h-10 w-full gap-2 bg-[#25D366] text-white hover:bg-[#1ebe5b]"
                onClick={handleWhatsAppShare}
              >
                <WhatsAppIcon className="size-4" /> Share on WhatsApp
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border bg-card p-3 text-center">
                <Users className="mx-auto size-4 text-muted-foreground mb-1" />
                <p className="text-lg font-bold leading-none">{rewardedCount}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Successful</p>
              </div>
              <div className="rounded-xl border bg-card p-3 text-center">
                <Clock className="mx-auto size-4 text-amber-500 mb-1" />
                <p className="text-lg font-bold leading-none">{pendingCount}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Pending</p>
              </div>
              <div className="rounded-xl border bg-card p-3 text-center">
                <Wallet className="mx-auto size-4 text-primary mb-1" />
                <p className="text-lg font-bold leading-none">{formatCurrency(totalEarned, currency)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Earned</p>
              </div>
            </div>

            {referrals.length > 0 && (
              <div className="overflow-hidden rounded-xl border bg-card divide-y">
                {referrals.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{r.referredName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <span
                      className={
                        r.status === "REWARDED"
                          ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                          : "text-xs font-medium text-amber-600 dark:text-amber-400"
                      }
                    >
                      {r.status === "REWARDED" && r.rewardAmount != null
                        ? `+${formatCurrency(r.rewardAmount, currency)}`
                        : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
