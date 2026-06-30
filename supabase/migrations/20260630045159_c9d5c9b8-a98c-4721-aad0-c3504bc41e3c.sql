
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS max_boost_cents integer NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS allow_upload boolean NOT NULL DEFAULT false;

ALTER TABLE public.queue_items DROP CONSTRAINT IF EXISTS queue_items_source_check;
ALTER TABLE public.queue_items ADD CONSTRAINT queue_items_source_check
  CHECK (source = ANY (ARRAY['youtube'::text, 'spotify'::text, 'soundcloud'::text, 'upload'::text]));
