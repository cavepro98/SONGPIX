import { createFileRoute } from "@tanstack/react-router";

function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rooms } = await supabaseAdmin
          .from("rooms")
          .select("slug, created_at")
          .is("archived_at", null)
          .order("created_at", { ascending: false });

        const siteUrl = (process.env.PUBLIC_SITE_URL || "https://songpix.app").replace(/\/$/, "");
        const urls = [
          `<url><loc>${escapeXml(`${siteUrl}/`)}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
          ...(rooms ?? []).map(
            (room) =>
              `<url><loc>${escapeXml(`${siteUrl}/${encodeURIComponent(room.slug)}`)}</loc><lastmod>${new Date(room.created_at).toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`,
          ),
        ];

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
          {
            headers: {
              "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
              "Content-Type": "application/xml; charset=utf-8",
            },
          },
        );
      },
    },
  },
});
