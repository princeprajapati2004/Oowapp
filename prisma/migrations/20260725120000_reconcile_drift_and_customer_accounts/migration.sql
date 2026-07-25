-- This migration reconciles two things already present on the live database
-- but missing from migration history (applied previously via `prisma db push`
-- without a corresponding migration file), plus the new Customer accounts
-- feature. It is being recorded via `prisma migrate resolve --applied`
-- rather than executed, since the live dev database already has this state.
--
-- 1. orders.paymentMethod / orders.source — pre-existing drift, unrelated to
--    the Customer accounts feature.
-- 2. push_subscriptions.updatedAt default — pre-existing drift; cosmetic
--    (Prisma always sets this field explicitly via @updatedAt), included
--    here purely so `prisma migrate status` reports zero drift going forward.
-- 3. customers table + orders.customerId — new, for customer login.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'qr';

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_shopId_idx" ON "customers"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopId_phone_key" ON "customers"("shopId", "phone");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restore the column-level default this migration history already expected
-- (see 20260720000001_features/migration.sql) — a prior `db push` dropped it.
ALTER TABLE "push_subscriptions" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
