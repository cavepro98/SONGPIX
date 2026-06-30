ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS is_top BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_queue_items_room_top ON public.queue_items(room_id, is_top);