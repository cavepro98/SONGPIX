ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS manual_order INTEGER;
CREATE INDEX IF NOT EXISTS queue_items_manual_order_idx ON public.queue_items(room_id, manual_order);