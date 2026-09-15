import Link from "next/link";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Shown in place of a gated page's content when the shop's subscription/
 * feature permissions don't include it — see
 * src/lib/services/feature-permission.ts. Plain server-renderable markup
 * (no client-only UI primitives) so every gated page.tsx/layout.tsx can stay
 * an async Server Component.
 */
export function FeatureLockedState({ featureLabel }: { featureLabel: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
      <EmptyState
        icon={Lock}
        title={`${featureLabel} isn't available on your current plan`}
        description="Ask your platform administrator to enable this feature, or upgrade your subscription."
        action={
          <Link
            href="/admin/settings"
            className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            View subscription
          </Link>
        }
      />
    </div>
  );
}
