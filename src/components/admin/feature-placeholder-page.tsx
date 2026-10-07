import { requireAdminSession } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/services/feature-permission";
import { FeatureLock } from "@/components/admin/feature-lock";

/**
 * Shared body for modules that don't have a real implementation yet (E-Invoicing,
 * E-Way Bills, Tally Export, Automated Billing, Data Backup, Marketing, Godowns) —
 * by explicit scope decision, these ship as subscription-gated placeholders, not
 * working features. Distinguishes two honest states:
 *   - Not entitled: the usual lock + Upgrade CTA.
 *   - Entitled (e.g. on Enterprise) but not yet built: a neutral "coming soon"
 *     notice, never a paywall — the owner already has access, there's just
 *     nothing behind it yet.
 * Route-level enforcement, matching admin-shell.tsx's own comment that hiding a
 * nav item is UX only — a direct navigation here re-checks independently.
 */
export async function FeaturePlaceholderPage({
  featureKey,
  title,
  description,
}: {
  featureKey: string;
  title: string;
  description: string;
}) {
  const session = await requireAdminSession();
  const enabled = await isFeatureEnabled(session.shopId, featureKey);

  return (
    <div className="mx-auto max-w-2xl py-10">
      {enabled ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            This is included in your plan and is coming soon — we&apos;ll notify you when it&apos;s ready.
          </p>
        </div>
      ) : (
        <FeatureLock label={title} description={description} />
      )}
    </div>
  );
}
