
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rooms
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cover_url TEXT,
  is_open BOOLEAN NOT NULL DEFAULT true,
  min_boost_cents INTEGER NOT NULL DEFAULT 100,
  allow_youtube BOOLEAN NOT NULL DEFAULT true,
  allow_spotify BOOLEAN NOT NULL DEFAULT true,
  allow_soundcloud BOOLEAN NOT NULL DEFAULT true,
  max_duration_sec INTEGER NOT NULL DEFAULT 600,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT ON public.rooms TO anon;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rooms are publicly readable" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Owners insert rooms" ON public.rooms FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update rooms" ON public.rooms FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners delete rooms" ON public.rooms FOR DELETE USING (auth.uid() = owner_id);

-- Queue items
CREATE TABLE public.queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('youtube','spotify','soundcloud')),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  thumbnail_url TEXT,
  duration_sec INTEGER,
  submitter_name TEXT NOT NULL,
  submitter_fingerprint TEXT,
  paid_amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','playing','played','skipped','blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  played_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_items TO authenticated;
GRANT SELECT, INSERT ON public.queue_items TO anon;
GRANT ALL ON public.queue_items TO service_role;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Queue items publicly readable" ON public.queue_items FOR SELECT USING (true);
CREATE POLICY "Anyone can submit to open rooms" ON public.queue_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.is_open = true)
  );
CREATE POLICY "Room owners update queue" ON public.queue_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.owner_id = auth.uid()));
CREATE POLICY "Room owners delete queue" ON public.queue_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.owner_id = auth.uid()));

CREATE INDEX queue_items_room_order ON public.queue_items (room_id, status, paid_amount_cents DESC, created_at ASC);

-- Boost RPC (atomic increase to paid_amount_cents)
CREATE OR REPLACE FUNCTION public.boost_queue_item(_item_id UUID, _amount_cents INTEGER)
RETURNS public.queue_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _item public.queue_items;
  _min INTEGER;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  SELECT r.min_boost_cents INTO _min
    FROM public.queue_items qi JOIN public.rooms r ON r.id = qi.room_id
    WHERE qi.id = _item_id;
  IF _min IS NULL THEN
    RAISE EXCEPTION 'Item not found';
  END IF;
  IF _amount_cents < _min THEN
    RAISE EXCEPTION 'Amount below minimum boost';
  END IF;
  UPDATE public.queue_items
    SET paid_amount_cents = paid_amount_cents + _amount_cents
    WHERE id = _item_id AND status = 'queued'
    RETURNING * INTO _item;
  RETURN _item;
END;
$$;
GRANT EXECUTE ON FUNCTION public.boost_queue_item(UUID, INTEGER) TO anon, authenticated;

-- Realtime
ALTER TABLE public.queue_items REPLICA IDENTITY FULL;
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
