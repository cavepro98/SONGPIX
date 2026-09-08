UPDATE public.platform_settings
SET min_boost_global_cents = 150,
    max_boost_global_cents = 15000,
    updated_at = now()
WHERE id = 1;

UPDATE public.rooms
SET min_boost_cents = LEAST(GREATEST(min_boost_cents, 150), 15000),
    max_boost_cents = GREATEST(
      LEAST(GREATEST(min_boost_cents, 150), 15000),
      LEAST(GREATEST(max_boost_cents, 150), 15000)
    )
WHERE min_boost_cents < 150
   OR min_boost_cents > 15000
   OR max_boost_cents < 150
   OR max_boost_cents > 15000
   OR max_boost_cents < min_boost_cents;

ALTER TABLE public.platform_settings
  ALTER COLUMN min_boost_global_cents SET DEFAULT 150,
  ALTER COLUMN max_boost_global_cents SET DEFAULT 15000;

ALTER TABLE public.rooms
  ALTER COLUMN min_boost_cents SET DEFAULT 150,
  ALTER COLUMN max_boost_cents SET DEFAULT 15000;
