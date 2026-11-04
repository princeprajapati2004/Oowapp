import Link from "next/link";
import { Lock, ChefHat, StoreIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

type Variant = "owner" | "staff" | "customer";

const COPY: Record<Variant, { icon: typeof Lock; title: string; description: string }> = {
  owner: {
    icon: Lock,
    title: "Your subscription has expired",
    description:
      "Renew your plan to keep using Oowapp for this business — every feature stays locked until it's renewed.",
  },
  staff: {
    icon: ChefHat,
    title: "This business's subscription has expired",
    description: "Ask your shop owner to renew the subscription to continue taking orders.",
  },
  customer: {
    icon: StoreIcon,
    title: "This store isn't accepting orders right now",
    description: "Please check back later or contact the shop directly.",
  },
};

/**
 * Account-wide lockout screen — stricter than feature-permission.ts's
 * per-feature FeatureLockedState. Rendered whenever subscription.ts's
 * isAccountAccessBlocked() is true, in place of ANY surface's normal content:
 * admin dashboard, counter/kitchen staff tools, or the customer ordering app.
 */
export function SubscriptionExpiredScreen({ variant }: { variant: Variant }) {
  const copy = COPY[variant];
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        description={copy.description}
        action={
          variant === "owner" ? (
            <Link
              href="/admin/subscription"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Renew Subscription
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
