-- OrderManagementRedesign
-- Additive only — no existing column/table/enum value is dropped or renamed,
-- so every historical order row keeps working unmodified.
--
-- Adds two delivery-only OrderStatus steps, two PaymentStatus states, a set
-- of nullable Order columns for partial payment / transaction reference /
-- cancellation tracking / owner-only notes, and a new append-only
-- OrderStatusEvent table for a real (non-fabricated) status timeline.

-- Extend OrderStatus with delivery-only steps
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

-- Extend PaymentStatus
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- Payment / cancellation / owner-note tracking on orders
ALTER TABLE "orders"
  ADD COLUMN "paidAmount" DECIMAL(10,2),
  ADD COLUMN "transactionReference" TEXT,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" TEXT,
  ADD COLUMN "ownerNote" TEXT;

-- Append-only order status history for a real (non-fabricated) timeline
CREATE TABLE "order_status_events" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedBy" TEXT,

  CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_status_events_orderId_idx" ON "order_status_events"("orderId");

ALTER TABLE "order_status_events"
  ADD CONSTRAINT "order_status_events_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
