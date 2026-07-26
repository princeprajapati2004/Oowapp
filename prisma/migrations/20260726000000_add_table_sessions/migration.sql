-- Table order lifecycle: groups a table's incremental QR/WhatsApp orders into
-- one running tab (TableSession) from first order until payment, plus
-- idempotency support on orders to dedupe retried/re-sent submissions.
--
-- Applied to the local dev database via `prisma db push` while iterating
-- (same pattern as prior drift-reconciliation migrations in this history);
-- this file is the migration-history record for `migrate deploy` on other
-- environments. On a dev database that already has this state via db push,
-- record it with `prisma migrate resolve --applied 20260726000000_add_table_sessions`
-- instead of re-running it.

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('ACTIVE', 'AWAITING_PAYMENT', 'PAID');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TABLE_SESSION_MARKED_PAID' BEFORE 'PLATFORM_SETTINGS_UPDATED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "tableSessionId" TEXT,
ADD COLUMN     "clientRequestId" TEXT;

-- CreateTable
CREATE TABLE "table_sessions" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerId" TEXT,
    "billRequestedAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "table_sessions_shopId_idx" ON "table_sessions"("shopId");

-- CreateIndex
CREATE INDEX "table_sessions_shopId_tableNumber_idx" ON "table_sessions"("shopId", "tableNumber");

-- Enforce one non-closed session per table per shop at the database level —
-- Prisma has no partial-unique-index syntax, so this is hand-added rather
-- than generated. Race-safe under concurrent WhatsApp submissions / double QR
-- scans regardless of app-level bugs; see resolveOrCreateSession in
-- src/lib/services/table-session.ts for the P2002-catch-and-retry path this
-- backs.
CREATE UNIQUE INDEX "table_sessions_shop_table_active_idx" ON "table_sessions"("shopId", "tableNumber") WHERE "status" <> 'PAID';

-- CreateIndex
CREATE INDEX "orders_tableSessionId_idx" ON "orders"("tableSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shopId_clientRequestId_key" ON "orders"("shopId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
