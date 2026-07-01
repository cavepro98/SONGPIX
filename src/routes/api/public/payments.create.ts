import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { mpCreatePixPayment } from "@/lib/mercadopago.server";
import { detectSource } from "@/lib/oembed";
import { assertPublicAppAvailable } from "@/lib/app-config.server";
import { publicJsonResponse, publicOptionsResponse } from "@/lib/cors.server";
import { createPaymentStatusToken, enforceRateLimit } from "@/lib/security.server";

const METHODS = ["POST"];

function json(request: Request, data: unknown, status: number) {
  return publicJsonResponse(request, data, { status, methods: METHODS });
}

const BodySchema = z.object({
  roomSlug: z.string().min(1).max(64),
  payerName: z.string().trim().min(1).max(80),
  payerEmail: z.string().email().max(160),
  amountCents: z.number().int().positive().max(1_000_000),
  // either an existing queue item to boost, or a new song to enqueue
  existingItemId: z.string().uuid().optional(),
  song: z
    .object({
      url: z.string().url().max(2000),
      title: z.string().min(1).max(200),
      artist: z.string().max(200).optional(),
      thumbnailUrl: z.string().url().max(2000).optional(),
    })
    .optional(),
});

async function fetchOembed(url: string, source: "youtube" | "spotify" | "soundcloud") {
  const oembedUrl =
    source === "youtube"
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
      : source === "soundcloud"
        ? `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
        : `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  try {
    const r = await fetch(oembedUrl, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return j;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/payments/create")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => publicOptionsResponse(request, METHODS),
      POST: async ({ request }) => {
        try {
          enforceRateLimit({ bucket: "payments-create", limit: 10, windowMs: 60_000 });
          await assertPublicAppAvailable();
          const body = BodySchema.parse(await request.json());
          if (!body.existingItemId && !body.song) {
            return json(request, { error: "Informe a música ou o item da fila" }, 400);
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: room, error: roomErr } = await supabaseAdmin
            .from("rooms")
            .select(
              "id, owner_id, name, is_open, min_boost_cents, max_boost_cents, allow_youtube, allow_spotify, allow_soundcloud",
            )
            .eq("slug", body.roomSlug)
            .maybeSingle();
          if (roomErr) throw new Error(roomErr.message);
          if (!room) return json(request, { error: "Sala não encontrada" }, 404);
          if (!room.is_open) return json(request, { error: "A sala está fechada" }, 400);

          const { data: settings } = await supabaseAdmin
            .from("platform_settings")
            .select("commission_rate, min_boost_global_cents, max_boost_global_cents")
            .eq("id", 1)
            .maybeSingle();
          const globalMinCents = Number(settings?.min_boost_global_cents ?? 100);
          const globalMaxCents = Number(settings?.max_boost_global_cents ?? 1_000_000);
          const effectiveMinCents = Math.max(Number(room.min_boost_cents ?? 0), globalMinCents);
          const effectiveMaxCents = Math.max(
            effectiveMinCents,
            Math.min(
              Number(room.max_boost_cents || globalMaxCents),
              Math.max(globalMinCents, globalMaxCents),
            ),
          );

          if (body.amountCents < effectiveMinCents)
            return json(
              request,
              { error: `Mínimo: R$ ${(effectiveMinCents / 100).toFixed(2)}` },
              400,
            );
          if (body.amountCents > effectiveMaxCents)
            return json(
              request,
              { error: `Máximo: R$ ${(effectiveMaxCents / 100).toFixed(2)}` },
              400,
            );

          // Commission
          const rate = Number(settings?.commission_rate ?? 0.1);
          const commission = Math.floor(body.amountCents * rate);
          const net = body.amountCents - commission;

          // Build song payload + validate
          let songPayload: Record<string, unknown> = {};
          if (body.existingItemId) {
            const { data: existing } = await supabaseAdmin
              .from("queue_items")
              .select("id, title, url, source, status")
              .eq("id", body.existingItemId)
              .eq("room_id", room.id)
              .maybeSingle();
            if (!existing || !["queued", "playing"].includes(existing.status))
              return json(request, { error: "Item da fila inválido" }, 400);
            songPayload = {
              existing_item_id: existing.id,
              title: existing.title,
              url: existing.url,
              source: existing.source,
            };
          } else if (body.song) {
            const source = detectSource(body.song.url);
            if (!source) return json(request, { error: "Fonte não suportada" }, 400);
            if (source === "youtube" && !room.allow_youtube) {
              return json(request, { error: "YouTube não permitido" }, 400);
            }
            if (source === "spotify" && !room.allow_spotify) {
              return json(request, { error: "Spotify não permitido" }, 400);
            }
            if (source === "soundcloud" && !room.allow_soundcloud) {
              return json(request, { error: "SoundCloud não permitido" }, 400);
            }

            const meta = await fetchOembed(body.song.url, source);
            songPayload = {
              source,
              url: body.song.url,
              title: meta?.title ?? body.song.title,
              artist: body.song.artist ?? meta?.author_name ?? "",
              thumbnail_url: body.song.thumbnailUrl ?? meta?.thumbnail_url ?? "",
            };
          }

          // 1) Create local row (pending)
          const { data: created, error: insErr } = await supabaseAdmin
            .from("payments")
            .insert({
              room_id: room.id,
              owner_id: room.owner_id,
              payer_name: body.payerName,
              payer_email: body.payerEmail,
              song_payload: songPayload as never,
              amount_cents: body.amountCents,
              commission_cents: commission,
              net_cents: net,
              status: "pending",
              provider: "mercadopago",
            })
            .select("id")
            .single();
          if (insErr) throw new Error(insErr.message);

          // 2) Build absolute URLs for MP.
          // Prefer an explicit public app URL so webhooks always target
          // the real deployed app instead of a temporary preview host.
          const reqOrigin = new URL(request.url).origin;
          const stableOrigin = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "") || reqOrigin;
          const notificationUrl = `${stableOrigin}/api/public/webhooks/mercadopago`;

          // 3) Call MP
          try {
            const mp = await mpCreatePixPayment({
              amountReais: body.amountCents / 100,
              description: `SongPIX fura fila - ${room.name}`.slice(0, 256),
              externalReference: created.id,
              notificationUrl,
              expirationMinutes: 15,
              payer: { email: body.payerEmail, first_name: body.payerName },
              idempotencyKey: created.id,
            });

            await supabaseAdmin
              .from("payments")
              .update({
                provider_payment_id: mp.id,
                pix_qr_code: mp.qr_code,
                pix_qr_code_base64: mp.qr_code_base64,
                pix_copy_paste: mp.qr_code,
                expires_at: mp.date_of_expiration,
              })
              .eq("id", created.id);

            return json(
              request,
              {
                paymentId: created.id,
                statusToken: createPaymentStatusToken(created.id),
                qrCode: mp.qr_code,
                qrCodeBase64: mp.qr_code_base64,
                expiresAt: mp.date_of_expiration,
                amountCents: body.amountCents,
              },
              200,
            );
          } catch (mpErr) {
            await supabaseAdmin
              .from("payments")
              .update({ status: "rejected" })
              .eq("id", created.id);
            const msg = mpErr instanceof Error ? mpErr.message : "Falha no provedor";
            return json(request, { error: msg }, 502);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erro";
          return json(request, { error: msg }, 400);
        }
      },
    },
  },
});
