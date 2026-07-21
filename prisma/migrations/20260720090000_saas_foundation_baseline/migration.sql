-- Retroactive baseline migration.
--
-- The SuperAdmin / Subscription / AuditLog / PlatformSettings models and the
-- Shop platform-lifecycle fields were added to schema.prisma in commit 549358a
-- ("feat: add login functionality for super admin and admin users") but no
-- migration was ever generated for that commit — the schema change was applied
-- directly (e.g. via `prisma db push`) instead of `prisma migrate dev`.
--
-- This migration exists so `prisma migrate deploy` produces a correct schema
-- on a FRESH database. If you are applying this to a database that already
-- has these tables/columns (i.e. any environment that inherited the db-push
-- drift), do NOT run this migration's SQL directly — instead run:
--
--   npx prisma migrate resolve --applied 20260720090000_saas_foundation_baseline
--
-- to record it as already-satisfied, then continue with `prisma migrate deploy`
-- as normal for anything after it.

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
    'ADMIN_SIGNUP',
    'ADMIN_LOGIN',
    'ADMIN_LOGOUT',
    'SUPER_ADMIN_LOGIN',
    'SUPER_ADMIN_LOGOUT',
    'SHOP_UPDATED',
    'SHOP_SUSPENDED',
    'SHOP_ACTIVATED',
    'SHOP_DELETED',
    'CATEGORY_CREATED',
    'CATEGORY_UPDATED',
    'CATEGORY_DELETED',
    'PRODUCT_CREATED',
    'PRODUCT_UPDATED',
    'PRODUCT_DELETED',
    'TAX_CREATED',
    'TAX_UPDATED',
    'TAX_DELETED',
    'ORDER_CREATED',
    'PLATFORM_SETTINGS_UPDATED',
    'SUBSCRIPTION_CHANGED'
);

-- AlterTable: shops — owner profile + platform lifecycle
ALTER TABLE "shops" ADD COLUMN "ownerName" TEXT;
ALTER TABLE "shops" ADD COLUMN "city" TEXT;
ALTER TABLE "shops" ADD COLUMN "state" TEXT;
ALTER TABLE "shops" ADD COLUMN "country" TEXT;
ALTER TABLE "shops" ADD COLUMN "status" "ShopStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "shops" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "shops" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "shops" ADD COLUMN "suspendedReason" TEXT;
ALTER TABLE "shops" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable: categories / products / taxes — createdBy / updatedBy actor tracking
ALTER TABLE "categories" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "categories" ADD COLUMN "updatedBy" TEXT;
ALTER TABLE "products" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "products" ADD COLUMN "updatedBy" TEXT;
ALTER TABLE "taxes" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "taxes" ADD COLUMN "updatedBy" TEXT;

-- CreateTable
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "shopId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_shopId_idx" ON "subscriptions"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE INDEX "audit_logs_shopId_idx" ON "audit_logs"("shopId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
