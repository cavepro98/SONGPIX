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
  v_existing uuid;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  IF p.status = 'approved' THEN
    RETURN p.queue_item_id;
  END IF;

  v_song := p.song_payload;
  v_existing := NULLIF(v_song->>'existing_item_id','')::uuid;

  IF v_existing IS NOT NULL THEN
    UPDATE public.queue_items
      SET paid_amount_cents = paid_amount_cents + p.amount_cents,
          payment_id = p.id
      WHERE id = v_existing AND room_id = p.room_id
      RETURNING id INTO new_item_id;
    IF new_item_id IS NULL THEN
      RAISE EXCEPTION 'queue item not found in this room';
    END IF;
  ELSE
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
      p.amount_cents,
      'queued',
      false,
      p.id
    ) RETURNING id INTO new_item_id;
  END IF;

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
