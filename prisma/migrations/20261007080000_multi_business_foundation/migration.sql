-- Phase 0: multi-business foundation.
-- One Admin can now own multiple Shops; Subscription moves from shop-level
-- to account-level (adminId becomes authoritative, shopId becomes legacy/
-- read-only). See SUBSCRIPTION_POS_ARCHITECTURE.md and the implementation
-- plan for full context.

-- Shop.adminId: drop the 1:1 unique constraint, keep a plain index.
DROP INDEX IF EXISTS "shops_adminId_key";
CREATE INDEX "shops_adminId_idx" ON "shops"("adminId");

-- Admin.lastActiveShopId: which shop to resume into at next login.
ALTER TABLE "admins" ADD COLUMN "lastActiveShopId" TEXT;
ALTER TABLE "admins" ADD CONSTRAINT "admins_lastActiveShopId_fkey"
  FOREIGN KEY ("lastActiveShopId") REFERENCES "shops"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Subscription.adminId: new authoritative ownership key.
ALTER TABLE "subscriptions" ADD COLUMN "adminId" TEXT;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "admins"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "subscriptions_adminId_idx" ON "subscriptions"("adminId");
CREATE INDEX "subscriptions_adminId_createdAt_idx" ON "subscriptions"("adminId", "createdAt");

-- Subscription.shopId: no longer required — legacy/read-only going forward.
ALTER TABLE "subscriptions" ALTER COLUMN "shopId" DROP NOT NULL;

-- Backfill adminId for every pre-existing row from its (still-1:1-at-the-time) shop.
UPDATE "subscriptions" s
SET "adminId" = sh."adminId"
FROM "shops" sh
WHERE sh.id = s."shopId" AND s."adminId" IS NULL;
