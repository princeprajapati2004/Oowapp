-- Phase 0: new audit action for an admin adding a second (or further)
-- business under their account via POST /api/admin/businesses.
ALTER TYPE "AuditAction" ADD VALUE 'SHOP_CREATED';
