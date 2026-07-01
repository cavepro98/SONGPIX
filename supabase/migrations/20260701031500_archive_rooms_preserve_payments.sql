ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS rooms_owner_active_idx
  ON public.rooms(owner_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS rooms_slug_active_idx
  ON public.rooms(slug)
  WHERE archived_at IS NULL;

ALTER TABLE public.payments
  ALTER COLUMN room_id DROP NOT NULL;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_room_id_fkey;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_room_id_fkey
  FOREIGN KEY (room_id)
  REFERENCES public.rooms(id)
  ON DELETE SET NULL;

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
