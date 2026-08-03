-- AddPaymentSystem
-- Adds paymentDisplayName to Shop for overriding the UPI payer name shown on payment screens.
-- Adds paymentStatus, paymentConfirmedBy, paymentConfirmedAt to Order for per-order payment tracking
-- (complements the existing TableSession-level payment tracking for table orders).

-- Create PaymentStatus enum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- Add paymentDisplayName to shops (optional override for the "Pay to" name shown on UPI QR / deep link)
ALTER TABLE "shops" ADD COLUMN "paymentDisplayName" TEXT;

-- Add payment tracking columns to orders
ALTER TABLE "orders"
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "paymentConfirmedBy" TEXT,
  ADD COLUMN "paymentConfirmedAt" TIMESTAMP(3);
