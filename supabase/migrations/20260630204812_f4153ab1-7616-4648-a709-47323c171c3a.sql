
-- 1) payments table
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  queue_item_id uuid REFERENCES public.queue_items(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL,
  payer_name text NOT NULL,
  payer_email text,
  song_payload jsonb NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  commission_cents integer NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
  net_cents integer NOT NULL CHECK (net_cents >= 0),
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled','refunded','expired')),
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_copy_paste text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_room ON public.payments(room_id);
CREATE INDEX idx_payments_owner ON public.payments(owner_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_created ON public.payments(created_at DESC);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "admins read all payments" ON public.payments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service role full access payments" ON public.payments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) room totals
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS total_gross_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_net_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_commission_cents bigint NOT NULL DEFAULT 0;

-- 3) queue_items <-> payments link
ALTER TABLE public.queue_items
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_queue_items_payment ON public.queue_items(payment_id);

-- 4) confirm_payment RPC (called only by service role via webhook)
CREATE OR REPLACE FUNCTION public.confirm_payment(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.payments%ROWTYPE;
  new_item_id uuid;
  v_song jsonb;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  IF p.status = 'approved' THEN
    RETURN p.queue_item_id;
  END IF;

  v_song := p.song_payload;

  INSERT INTO public.queue_items (
    room_id, title, artist, url, source, thumbnail_url,
    submitter_name, paid_amount_cents, status, is_top, payment_id
  ) VALUES (
    p.room_id,
    COALESCE(v_song->>'title', 'Música'),
    NULLIF(v_song->>'artist',''),
    v_song->>'url',
    COALESCE(v_song->>'source','unknown'),
    NULLIF(v_song->>'thumbnail_url',''),
    p.payer_name,
    p.net_cents,
    'queued',
    true,
    p.id
  ) RETURNING id INTO new_item_id;

  UPDATE public.payments
    SET status = 'approved',
        paid_at = now(),
        queue_item_id = new_item_id
    WHERE id = p.id;

  UPDATE public.rooms
    SET total_gross_cents = total_gross_cents + p.amount_cents,
        total_net_cents = total_net_cents + p.net_cents,
        total_commission_cents = total_commission_cents + p.commission_cents
    WHERE id = p.room_id;

  RETURN new_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment(uuid) TO service_role;
