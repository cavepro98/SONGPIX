ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS seo_title text NOT NULL DEFAULT 'SongPIX | pedidos de música com PIX para lives',
  ADD COLUMN IF NOT EXISTS seo_description text NOT NULL DEFAULT 'Crie uma fila de músicas para sua live, receba pedidos e organize apoios via PIX com o SongPIX.',
  ADD COLUMN IF NOT EXISTS seo_keywords text NOT NULL DEFAULT 'pedidos de música, fila de músicas, PIX para live, overlay para live, SongPIX',
  ADD COLUMN IF NOT EXISTS seo_canonical_url text NOT NULL DEFAULT 'https://songpix.app',
  ADD COLUMN IF NOT EXISTS seo_og_image_url text,
  ADD COLUMN IF NOT EXISTS home_badge text NOT NULL DEFAULT 'Pedidos de música via PIX',
  ADD COLUMN IF NOT EXISTS home_title text NOT NULL DEFAULT 'Sua live com música, PIX e fila ao vivo.',
  ADD COLUMN IF NOT EXISTS home_description text NOT NULL DEFAULT 'Crie uma sala, compartilhe o link com o público e receba pedidos de música em tempo real. Quem quiser apoiar usa o Fura Fila via PIX para ganhar prioridade, enquanto você mantém o controle do que entra, toca ou sai da fila.',
  ADD COLUMN IF NOT EXISTS home_primary_cta text NOT NULL DEFAULT 'Criar primeira sala';

ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_seo_title_length CHECK (char_length(seo_title) BETWEEN 1 AND 70),
  ADD CONSTRAINT platform_settings_seo_description_length CHECK (char_length(seo_description) BETWEEN 1 AND 180),
  ADD CONSTRAINT platform_settings_home_title_length CHECK (char_length(home_title) BETWEEN 1 AND 120),
  ADD CONSTRAINT platform_settings_home_description_length CHECK (char_length(home_description) BETWEEN 1 AND 300);
