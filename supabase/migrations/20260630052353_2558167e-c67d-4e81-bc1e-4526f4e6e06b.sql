
CREATE TABLE public.platform_settings (
  id INT PRIMARY KEY DEFAULT 1,
  platform_name TEXT NOT NULL DEFAULT 'SongPIX',
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  min_boost_global_cents INT NOT NULL DEFAULT 100 CHECK (min_boost_global_cents >= 0),
  max_boost_global_cents INT NOT NULL DEFAULT 1000000 CHECK (max_boost_global_cents >= 0),
  allow_signups BOOLEAN NOT NULL DEFAULT true,
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  support_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
GRANT SELECT ON public.platform_settings TO authenticated, anon;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read platform settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update platform settings" ON public.platform_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
