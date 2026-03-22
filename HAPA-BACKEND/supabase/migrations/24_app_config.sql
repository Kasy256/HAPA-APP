-- Migration: 24_app_config.sql
-- Creates a global app_settings table used as a remote kill-switch for iOS App Store Review.
-- Since Apple strictly bans 3rd party payments (Paystack) for digital goods (subscriptions/boosts),
-- we default `ios_payments_enabled` to `false` so the reviewer never sees the Paystack UI.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
    id INT PRIMARY KEY DEFAULT 1,
    ios_payments_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one row exists
ALTER TABLE public.app_settings ADD CONSTRAINT single_row CHECK (id = 1);

-- Insert default row
INSERT INTO public.app_settings (id, ios_payments_enabled) 
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Public can read, only Admins can update
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update app settings" ON public.app_settings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

COMMIT;
