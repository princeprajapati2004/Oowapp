-- Add ordering mode and staff member support. Purely additive.

-- CreateEnum
CREATE TYPE "OrderMode" AS ENUM ('WHATSAPP', 'DIRECT');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('MANAGER', 'KITCHEN', 'WAITER');

-- AlterTable: add orderMode to shops
ALTER TABLE "shops" ADD COLUMN "orderMode" "OrderMode" NOT NULL DEFAULT 'WHATSAPP';

-- CreateTable: staff_members
CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "StaffRole" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_shopId_email_key" ON "staff_members"("shopId", "email") WHERE "email" IS NOT NULL;

-- CreateIndex
CREATE INDEX "staff_members_shopId_idx" ON "staff_members"("shopId");

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add staffId to orders
ALTER TABLE "orders" ADD COLUMN "staffId" TEXT;

-- CreateIndex
CREATE INDEX "orders_staffId_idx" ON "orders"("staffId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
