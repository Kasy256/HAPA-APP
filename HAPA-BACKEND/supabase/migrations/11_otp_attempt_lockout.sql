-- Migration: 11_otp_attempt_lockout
-- Adds attempt tracking to otp_codes table for brute-force protection.
-- After 5 failed attempts, the code is considered locked.

-- 1. Add attempts counter column (defaults to 0)
ALTER TABLE public.otp_codes
    ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

-- 2. Add index for fast lookup of non-expired codes by phone
CREATE INDEX IF NOT EXISTS otp_codes_phone_expires_idx
    ON public.otp_codes (phone_number, expires_at DESC);
