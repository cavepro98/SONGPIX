ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS require_payment boolean NOT NULL DEFAULT false;
