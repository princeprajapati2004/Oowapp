import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { Prisma } from "@/generated/prisma/client";

/** The terms a business owner must see/accept before purchasing this plan — null if none have ever been published. */
export async function getActiveTermsForPlan(planId: string) {
  return db.subscriptionTermsVersion.findFirst({ where: { planId, isActive: true } });
}

/**
 * Publishes a NEW version (never edits an existing row in place — see the
 * schema's own doc comment on why) and deactivates whichever version was
 * previously active, atomically. Acceptances of the old version are left
 * untouched; they're a permanent record of what was agreed to, not
 * retroactively invalidated.
 */
export async function publishTermsVersion(planId: string, content: string, createdBy: string) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const previous = await tx.subscriptionTermsVersion.findFirst({
      where: { planId, isActive: true },
    });
    if (previous) {
      await tx.subscriptionTermsVersion.update({ where: { id: previous.id }, data: { isActive: false } });
    }
    const nextVersion = (previous?.version ?? 0) + 1;
    return tx.subscriptionTermsVersion.create({
      data: { planId, version: nextVersion, content, createdBy, isActive: true },
    });
  });
}

/** History of every version ever published for this plan, newest first. */
export async function listTermsVersions(planId: string) {
  return db.subscriptionTermsVersion.findMany({ where: { planId }, orderBy: { version: "desc" } });
}

/** Whether this admin has accepted whichever terms version is CURRENTLY active for this plan. */
export async function hasAcceptedCurrentTerms(adminId: string, planId: string): Promise<boolean> {
  const active = await getActiveTermsForPlan(planId);
  if (!active) return true; // no terms published for this plan — nothing to accept
  const acceptance = await db.subscriptionTermsAcceptance.findUnique({
    where: { termsVersionId_adminId: { termsVersionId: active.id, adminId } },
  });
  return acceptance !== null;
}

/** Records acceptance of a specific version — the caller must have already shown that exact version's content. */
export async function recordTermsAcceptance(adminId: string, termsVersionId: string) {
  const version = await db.subscriptionTermsVersion.findUnique({ where: { id: termsVersionId } });
  if (!version) throw new NotFoundError("Terms version not found");

  return db.subscriptionTermsAcceptance.upsert({
    where: { termsVersionId_adminId: { termsVersionId, adminId } },
    create: { termsVersionId, adminId },
    update: {},
  });
}
