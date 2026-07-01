CREATE TABLE IF NOT EXISTS public.overlay_test_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('support')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS overlay_test_events_room_created_idx
  ON public.overlay_test_events(room_id, created_at DESC);

GRANT SELECT ON public.overlay_test_events TO anon;
GRANT SELECT, INSERT ON public.overlay_test_events TO authenticated;
GRANT ALL ON public.overlay_test_events TO service_role;

ALTER TABLE public.overlay_test_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Overlay test events are publicly readable" ON public.overlay_test_events;
CREATE POLICY "Overlay test events are publicly readable"
ON public.overlay_test_events FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Room owners insert overlay test events" ON public.overlay_test_events;
CREATE POLICY "Room owners insert overlay test events"
ON public.overlay_test_events FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = room_id
      AND r.owner_id = auth.uid()
  )
);

ALTER TABLE public.overlay_test_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.overlay_test_events;
