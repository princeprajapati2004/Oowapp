-- Add QR ordering and product image settings to shops
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "enableQrOrdering" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "showProductImages" BOOLEAN NOT NULL DEFAULT true;

-- Create expenses table
CREATE TABLE IF NOT EXISTS "expenses" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX IF NOT EXISTS "expenses_shopId_idx" ON "expenses"("shopId");
CREATE INDEX IF NOT EXISTS "expenses_shopId_date_idx" ON "expenses"("shopId", "date");

-- Add foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_shopId_fkey'
  ) THEN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopId_fkey"
      FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
