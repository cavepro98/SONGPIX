UPDATE public.platform_settings
SET min_boost_global_cents = GREATEST(min_boost_global_cents, 50),
    max_boost_global_cents = GREATEST(max_boost_global_cents, 50),
    updated_at = now()
WHERE id = 1;

WITH limits AS (
  SELECT
    min_boost_global_cents AS min_cents,
    GREATEST(min_boost_global_cents, max_boost_global_cents) AS max_cents
  FROM public.platform_settings
  WHERE id = 1
)
UPDATE public.rooms AS room
SET
  min_boost_cents = LEAST(GREATEST(room.min_boost_cents, limits.min_cents), limits.max_cents),
  max_boost_cents = GREATEST(
    LEAST(GREATEST(room.min_boost_cents, limits.min_cents), limits.max_cents),
    LEAST(GREATEST(room.max_boost_cents, limits.min_cents), limits.max_cents)
  )
FROM limits;

ALTER TABLE public.payments
  ALTER COLUMN provider SET DEFAULT 'pushinpay';
