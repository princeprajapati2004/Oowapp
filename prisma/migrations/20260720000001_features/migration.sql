-- Feature 1: Optional table number system
ALTER TABLE "shops" ADD COLUMN "enableTableNumber" BOOLEAN NOT NULL DEFAULT true;
-- Disable by default for non-food businesses (delivery/retail)
UPDATE "shops" SET "enableTableNumber" = false
  WHERE "businessType" IN ('GROCERY', 'MEDICAL', 'ELECTRONICS', 'CLOTHING', 'STORE', 'OTHER');

-- Feature 3: Bill discount
ALTER TABLE "orders" ADD COLUMN "discountType" TEXT;
ALTER TABLE "orders" ADD COLUMN "discountValue" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN "discountReason" TEXT;
ALTER TABLE "orders" ADD COLUMN "discountedTotal" DECIMAL(10,2);

-- Feature 4: Push notification preferences on shops
ALTER TABLE "shops" ADD COLUMN "notifyNewOrders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "shops" ADD COLUMN "notifyOrderUpdates" BOOLEAN NOT NULL DEFAULT true;

-- Feature 4: Push subscription storage
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_shopId_idx" ON "push_subscriptions"("shopId");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
