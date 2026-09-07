-- Add LOGIN to EmailVerificationPurpose enum
-- The original migration (20260807000001) created this enum with ('SIGNUP', 'PASSWORD_RESET').
-- The login OTP flow uses 'LOGIN' which was missing from the DB enum, causing
-- "Something went wrong" errors when users tried to log in via OTP.

ALTER TYPE "EmailVerificationPurpose" ADD VALUE IF NOT EXISTS 'LOGIN';
