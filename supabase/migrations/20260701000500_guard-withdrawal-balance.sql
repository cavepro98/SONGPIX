CREATE OR REPLACE FUNCTION public.guard_withdrawal_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

  SELECT COALESCE(SUM(total_net_cents), 0)
    INTO v_net_cents
  FROM public.rooms
  WHERE owner_id = NEW.user_id;

  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_reserved_cents
  FROM public.withdrawals
  WHERE user_id = NEW.user_id
    AND status IN ('pending', 'approved', 'paid')
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  v_available_cents := GREATEST(0, v_net_cents - v_reserved_cents);

  IF NEW.amount_cents > v_available_cents THEN
    RAISE EXCEPTION 'withdrawal amount exceeds available balance';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_withdrawal_balance_trigger ON public.withdrawals;

CREATE TRIGGER guard_withdrawal_balance_trigger
BEFORE INSERT OR UPDATE OF user_id, amount_cents, status ON public.withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.guard_withdrawal_balance();
