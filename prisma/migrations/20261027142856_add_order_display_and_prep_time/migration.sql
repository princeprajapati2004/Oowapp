-- CreateEnum
CREATE TYPE "DisplayType" AS ENUM ('KITCHEN', 'CUSTOMER_STATUS', 'PREPARATION', 'READY_PICKUP', 'DELIVERY_DISPATCH', 'TOKEN', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORDER_PREP_DELAYED';
ALTER TYPE "AuditAction" ADD VALUE 'DISPLAY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'DISPLAY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DISPLAY_TOKEN_ROTATED';
ALTER TYPE "AuditAction" ADD VALUE 'DISPLAY_DELETED';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "prepTimeMinutes" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "actualReadyAt" TIMESTAMP(3),
ADD COLUMN     "estimatedPrepMinutes" INTEGER,
ADD COLUMN     "estimatedReadyAt" TIMESTAMP(3),
ADD COLUMN     "prepDelayFlag" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "prepTimeMinutes" INTEGER;

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "prepTimeSettings" JSONB;

-- CreateTable
CREATE TABLE "displays" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DisplayType" NOT NULL,
    "token" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "allowStaffActions" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "displays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_prep_estimate_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "estimatedReadyAt" TIMESTAMP(3) NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "setBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_prep_estimate_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "displays_token_key" ON "displays"("token");

-- CreateIndex
CREATE INDEX "displays_shopId_idx" ON "displays"("shopId");

-- CreateIndex
CREATE INDEX "order_prep_estimate_events_orderId_idx" ON "order_prep_estimate_events"("orderId");

-- AddForeignKey
ALTER TABLE "displays" ADD CONSTRAINT "displays_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_prep_estimate_events" ADD CONSTRAINT "order_prep_estimate_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
