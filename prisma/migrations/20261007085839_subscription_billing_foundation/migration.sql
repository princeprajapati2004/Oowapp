-- CreateEnum
CREATE TYPE "LimitKey" AS ENUM ('BUSINESSES', 'USERS', 'PRODUCTS', 'GODOWNS', 'STORAGE_MB', 'MONTHLY_ORDERS', 'CUSTOMERS', 'INVOICES');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'PENDING', 'CANCELLED', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PLAN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PLAN_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'FEATURE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_PAYMENT_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_PAYMENT_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_COUPON_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_COUPON_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_COUPON_REDEEMED';

-- AlterEnum
ALTER TYPE "SubscriptionActionType" ADD VALUE 'DOWNGRADE_SCHEDULED';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "annualPrice" DECIMAL(10,2),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPopular" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlyPrice" DECIMAL(10,2),
ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pendingBillingCycle" "BillingCycle",
ADD COLUMN     "pendingPlanId" TEXT;

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "limitKey" "LimitKey" NOT NULL,
    "limitValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_transactions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "couponId" TEXT,
    "invoiceNumber" TEXT,
    "activatedSubscriptionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "RewardValueType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxDiscountAmount" DECIMAL(10,2),
    "minAmount" DECIMAL(10,2),
    "applicablePlanCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "totalUsageLimit" INTEGER,
    "perAdminLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_planId_limitKey_key" ON "plan_limits"("planId", "limitKey");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_transactions_gatewayPaymentId_key" ON "subscription_transactions"("gatewayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_transactions_invoiceNumber_key" ON "subscription_transactions"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_transactions_activatedSubscriptionId_key" ON "subscription_transactions"("activatedSubscriptionId");

-- CreateIndex
CREATE INDEX "subscription_transactions_adminId_idx" ON "subscription_transactions"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_coupons_code_key" ON "subscription_coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_coupon_redemptions_transactionId_key" ON "subscription_coupon_redemptions"("transactionId");

-- CreateIndex
CREATE INDEX "subscription_coupon_redemptions_couponId_idx" ON "subscription_coupon_redemptions"("couponId");

-- CreateIndex
CREATE INDEX "subscription_coupon_redemptions_adminId_idx" ON "subscription_coupon_redemptions"("adminId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_transactions" ADD CONSTRAINT "subscription_transactions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_transactions" ADD CONSTRAINT "subscription_transactions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_transactions" ADD CONSTRAINT "subscription_transactions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "subscription_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_coupon_redemptions" ADD CONSTRAINT "subscription_coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "subscription_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_coupon_redemptions" ADD CONSTRAINT "subscription_coupon_redemptions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_coupon_redemptions" ADD CONSTRAINT "subscription_coupon_redemptions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "subscription_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
