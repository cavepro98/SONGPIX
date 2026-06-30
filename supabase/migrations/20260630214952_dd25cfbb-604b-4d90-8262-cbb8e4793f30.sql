ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS min_withdrawal_cents integer NOT NULL DEFAULT 500
  CHECK (min_withdrawal_cents >= 100);