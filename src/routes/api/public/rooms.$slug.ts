import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { publicJsonResponse, publicOptionsResponse } from "@/lib/cors.server";
import { enforceRateLimit } from "@/lib/security.server";
import { assertPublicAppAvailable } from "@/lib/app-config.server";

const METHODS = ["GET"];
const SlugSchema = z.string().trim().min(1).max(64);

export const Route = createFileRoute("/api/public/rooms/$slug")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => publicOptionsResponse(request, METHODS),
      GET: async ({ request, params }) => {
        try {
          await enforceRateLimit({ bucket: "public-room-read", limit: 120, windowMs: 60_000 });
          await assertPublicAppAvailable();
          const slug = SlugSchema.parse(params.slug);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: room, error: roomError } = await supabaseAdmin
            .from("rooms")
            .select(
              "id, slug, name, description, cover_url, is_open, min_boost_cents, max_boost_cents, allow_upload, require_payment",
            )
            .eq("slug", slug)
            .is("archived_at", null)
            .maybeSingle();
          if (roomError) throw new Error(roomError.message);
          if (!room) {
            return publicJsonResponse(
              request,
              { error: "Sala não encontrada" },
              { status: 404, methods: METHODS },
            );
          }

          const queueSelect =
            "id, title, artist, thumbnail_url, source, url, submitter_name, paid_amount_cents, status, created_at, duration_sec, is_top, manual_order, played_at";
          const [{ data: items, error: itemsError }, { data: history, error: historyError }] =
            await Promise.all([
              supabaseAdmin
                .from("queue_items")
                .select(queueSelect)
                .eq("room_id", room.id)
                .in("status", ["queued", "playing"]),
              supabaseAdmin
                .from("queue_items")
                .select(queueSelect)
                .eq("room_id", room.id)
                .in("status", ["played", "skipped"])
                .order("played_at", { ascending: false })
                .limit(50),
            ]);
          if (itemsError) throw new Error(itemsError.message);
          if (historyError) throw new Error(historyError.message);

          return publicJsonResponse(
            request,
            { room, items: items ?? [], history: history ?? [] },
            { status: 200, methods: METHODS },
          );
        } catch (error) {
          return publicJsonResponse(
            request,
            { error: error instanceof Error ? error.message : "Erro ao carregar a sala" },
            { status: 400, methods: METHODS },
          );
        }
      },
    },
  },
});
