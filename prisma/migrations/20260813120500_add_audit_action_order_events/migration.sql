-- AddAuditActionOrderEvents
-- Additive only — new enum values, nothing removed or renamed. Extends
-- AuditAction so order cancellation and table-session release/transfer/merge
-- can be written to the audit trail alongside the existing ORDER_CREATED /
-- ORDER_MARKED_PAID / TABLE_SESSION_MARKED_PAID values.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TABLE_SESSION_RELEASED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TABLE_SESSION_TRANSFERRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TABLE_SESSION_MERGED';
