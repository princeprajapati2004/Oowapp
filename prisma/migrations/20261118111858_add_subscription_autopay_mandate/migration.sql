-- CreateEnum
CREATE TYPE "AutoPayMandateStatus" AS ENUM ('CREATED', 'AUTHENTICATED', 'ACTIVE', 'PENDING', 'HALTED', 'CANCELLED', 'COMPLETED', 'EXPIRED');

-- AlterTable
ALTER TABLE "subscription_transactions" ADD COLUMN     "autoPayMandateId" TEXT;

-- CreateTable
CREATE TABLE "subscription_autopay_mandates" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "razorpayPlanId" TEXT NOT NULL,
    "razorpaySubscriptionId" TEXT NOT NULL,
    "status" "AutoPayMandateStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_autopay_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_autopay_mandates_razorpaySubscriptionId_key" ON "subscription_autopay_mandates"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "subscription_autopay_mandates_adminId_idx" ON "subscription_autopay_mandates"("adminId");

-- AddForeignKey
ALTER TABLE "subscription_transactions" ADD CONSTRAINT "subscription_transactions_autoPayMandateId_fkey" FOREIGN KEY ("autoPayMandateId") REFERENCES "subscription_autopay_mandates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_autopay_mandates" ADD CONSTRAINT "subscription_autopay_mandates_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_autopay_mandates" ADD CONSTRAINT "subscription_autopay_mandates_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
