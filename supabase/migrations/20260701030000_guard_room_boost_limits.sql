WITH limits AS (
  SELECT
    COALESCE(min_boost_global_cents, 100) AS min_cents,
    GREATEST(
      COALESCE(min_boost_global_cents, 100),
      COALESCE(max_boost_global_cents, 1000000)
    ) AS max_cents
  FROM public.platform_settings
  WHERE id = 1
)
UPDATE public.rooms r
SET
  min_boost_cents = LEAST(GREATEST(r.min_boost_cents, l.min_cents), l.max_cents),
  max_boost_cents = GREATEST(
    LEAST(GREATEST(r.min_boost_cents, l.min_cents), l.max_cents),
    LEAST(GREATEST(r.max_boost_cents, l.min_cents), l.max_cents)
  )
FROM limits l;

CREATE OR REPLACE FUNCTION public.guard_room_boost_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_min_cents integer := 100;
  v_max_cents integer := 1000000;
BEGIN
  SELECT
    COALESCE(min_boost_global_cents, 100),
    GREATEST(
      COALESCE(min_boost_global_cents, 100),
      COALESCE(max_boost_global_cents, 1000000)
    )
  INTO v_min_cents, v_max_cents
  FROM public.platform_settings
  WHERE id = 1;

  IF NEW.min_boost_cents < v_min_cents THEN
    RAISE EXCEPTION 'room min_boost_cents is below platform minimum';
  END IF;

  IF NEW.min_boost_cents > v_max_cents THEN
    RAISE EXCEPTION 'room min_boost_cents is above platform maximum';
  END IF;

  IF NEW.max_boost_cents < NEW.min_boost_cents THEN
    RAISE EXCEPTION 'room max_boost_cents must be greater than or equal to min_boost_cents';
  END IF;

  IF NEW.max_boost_cents > v_max_cents THEN
    RAISE EXCEPTION 'room max_boost_cents is above platform maximum';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_room_boost_limits_trigger ON public.rooms;

CREATE TRIGGER guard_room_boost_limits_trigger
BEFORE INSERT OR UPDATE OF min_boost_cents, max_boost_cents ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.guard_room_boost_limits();
