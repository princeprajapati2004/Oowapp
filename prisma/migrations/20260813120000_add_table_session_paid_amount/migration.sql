-- AddTableSessionPaidAmount
-- Additive only — nullable column, no existing data touched. Tracks the
-- cumulative amount collected against a table session's running bill, so a
-- session can be part-paid and stay open with a remaining balance instead of
-- forcing an all-or-nothing settlement.

ALTER TABLE "table_sessions"
  ADD COLUMN "paidAmount" DECIMAL(10,2);
