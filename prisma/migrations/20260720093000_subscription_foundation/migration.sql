-- Subscription Management System — Phase 1 (schema foundation)
-- See SUBSCRIPTION_POS_ARCHITECTURE.md for the full design rationale.

-- AlterEnum: add SUSPENDED as a subscription-level status distinct from
-- Shop.status = SUSPENDED (account-level). Postgres requires ADD VALUE to run
-- outside of the same transaction that uses the new value — safe here since
-- nothing in this migration reads/writes 'SUSPENDED' rows yet.
ALTER TYPE "SubscriptionStatus" ADD VALUE 'SUSPENDED';

-- CreateEnum
CREATE TYPE "SubscriptionDuration" AS ENUM ('FIFTEEN_DAYS', 'ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS', 'TWELVE_MONTHS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SubscriptionActionType" AS ENUM ('CREATED', 'RENEWED', 'EXTENDED', 'PLAN_CHANGED', 'SUSPENDED', 'RESUMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "features" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_feature_permissions" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_feature_permissions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: subscriptions — history metadata + link to the new Plan table
ALTER TABLE "subscriptions" ADD COLUMN "planId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "duration" "SubscriptionDuration" NOT NULL DEFAULT 'ONE_MONTH';
ALTER TABLE "subscriptions" ADD COLUMN "action" "SubscriptionActionType" NOT NULL DEFAULT 'CREATED';
ALTER TABLE "subscriptions" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "remarks" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "features_key_key" ON "features"("key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_planId_featureId_key" ON "plan_features"("planId", "featureId");

-- CreateIndex
CREATE UNIQUE INDEX "business_feature_permissions_shopId_featureId_key" ON "business_feature_permissions"("shopId", "featureId");

-- CreateIndex
CREATE INDEX "business_feature_permissions_shopId_idx" ON "business_feature_permissions"("shopId");

-- CreateIndex
CREATE INDEX "subscriptions_shopId_createdAt_idx" ON "subscriptions"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_feature_permissions" ADD CONSTRAINT "business_feature_permissions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_feature_permissions" ADD CONSTRAINT "business_feature_permissions_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
