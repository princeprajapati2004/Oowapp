-- CreateTable
CREATE TABLE "subscription_usage_records" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT,
    "featureKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "relatedRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_usage_records_adminId_createdAt_idx" ON "subscription_usage_records"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_usage_records_shopId_featureKey_createdAt_idx" ON "subscription_usage_records"("shopId", "featureKey", "createdAt");

-- AddForeignKey
ALTER TABLE "subscription_usage_records" ADD CONSTRAINT "subscription_usage_records_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_usage_records" ADD CONSTRAINT "subscription_usage_records_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_usage_records" ADD CONSTRAINT "subscription_usage_records_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_usage_records" ADD CONSTRAINT "subscription_usage_records_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
