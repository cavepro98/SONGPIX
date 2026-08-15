-- Public pages read through a sanitized server endpoint instead of exposing
-- every room and queue row through the anonymous PostgREST role.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.rooms FROM anon;
REVOKE SELECT ON public.queue_items FROM anon;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Rooms are publicly readable" ON public.rooms;
DROP POLICY IF EXISTS "Queue items publicly readable" ON public.queue_items;

CREATE POLICY "Users read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Owners read own rooms"
ON public.rooms FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Room owners read own queue"
ON public.queue_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = room_id
      AND r.owner_id = auth.uid()
  )
);

CREATE POLICY "Admins read all queue"
ON public.queue_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_withdrawal_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_net_cents bigint;
  v_reserved_cents bigint;
  v_available_cents bigint;
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'paid') THEN
    RETURN NEW;
  END IF;

  -- Serialize balance reservations for the same account.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

  SELECT COALESCE(SUM(net_cents), 0)
  INTO v_net_cents
  FROM public.payments
  WHERE owner_id = NEW.user_id
    AND status = 'approved';

  SELECT COALESCE(SUM(amount_cents), 0)
  INTO v_reserved_cents
  FROM public.withdrawals
  WHERE user_id = NEW.user_id
    AND status IN ('pending', 'approved', 'paid')
    AND id IS DISTINCT FROM NEW.id;

  v_available_cents := GREATEST(0, v_net_cents - v_reserved_cents);

  IF NEW.amount_cents > v_available_cents THEN
    RAISE EXCEPTION 'withdrawal amount exceeds available balance';
  END IF;

  RETURN NEW;
END;
$$;
