-- Add optional manual priority marker for Kitchen Display badges (VIP
-- customer / Rush order). Nullable, no default backfill — existing rows are
-- unaffected.
ALTER TABLE "orders" ADD COLUMN "priorityFlag" TEXT;
