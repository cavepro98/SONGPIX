import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SlugInput = z.string().trim().min(1).max(64);

const DEFAULT_SEO = {
  platformName: "SongPIX",
  title: "SongPIX | pedidos de música com PIX para lives",
  description:
    "Crie uma fila de músicas para sua live, receba pedidos e organize apoios via PIX com o SongPIX.",
  keywords: "pedidos de música, fila de músicas, PIX para live, overlay para live, SongPIX",
  canonicalUrl: "https://songpix.app",
  ogImageUrl: null as string | null,
  homeBadge: "Pedidos de música via PIX",
  homeTitle: "Sua live com música, PIX e fila ao vivo.",
  homeDescription:
    "Crie uma sala, compartilhe o link com o público e receba pedidos de música em tempo real. Quem quiser apoiar usa o Fura Fila via PIX para ganhar prioridade, enquanto você mantém o controle do que entra, toca ou sai da fila.",
  homePrimaryCta: "Criar primeira sala",
};

async function readSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select(
      "platform_name, seo_title, seo_description, seo_keywords, seo_canonical_url, seo_og_image_url, home_badge, home_title, home_description, home_primary_cta",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export const getPublicSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const data = await readSettings();
  return {
    platformName: data?.platform_name || DEFAULT_SEO.platformName,
    title: data?.seo_title || DEFAULT_SEO.title,
    description: data?.seo_description || DEFAULT_SEO.description,
    keywords: data?.seo_keywords || DEFAULT_SEO.keywords,
    canonicalUrl: data?.seo_canonical_url || DEFAULT_SEO.canonicalUrl,
    ogImageUrl: data?.seo_og_image_url || DEFAULT_SEO.ogImageUrl,
    homeBadge: data?.home_badge || DEFAULT_SEO.homeBadge,
    homeTitle: data?.home_title || DEFAULT_SEO.homeTitle,
    homeDescription: data?.home_description || DEFAULT_SEO.homeDescription,
    homePrimaryCta: data?.home_primary_cta || DEFAULT_SEO.homePrimaryCta,
  };
});

export const getPublicRoomMeta = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => SlugInput.parse(input))
  .handler(async ({ data: slug }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("rooms")
      .select("name, description, cover_url, slug")
      .eq("slug", slug)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });
