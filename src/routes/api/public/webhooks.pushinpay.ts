import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/security.server";

const WebhookSchema = z
  .object({
    id: z.string().min(1).max(200),
    value: z.number().int().positive().optional(),
    status: z.enum(["created", "paid", "canceled", "expired"]),
  })
  .passthrough();

function getSafeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("confirm_payment:")) return "confirmation-failed";
  if (message.startsWith("payment status update:")) return "status-update-failed";
  return "internal-error";
}

async function removePaidUploadIfNeeded(
  supabaseAdmin: any,
  songPayload: Record<string, unknown> | null,
) {
  if (songPayload?.source !== "upload" || typeof songPayload.url !== "string") return;
  await supabaseAdmin.storage.from("song-uploads").remove([songPayload.url]);
}

export const Route = createFileRoute("/api/public/webhooks/pushinpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        enforceRateLimit({ bucket: "pushinpay-webhook", limit: 60, windowMs: 60_000 });

        const parsed = WebhookSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("invalid payload", { status: 400 });
        if (parsed.data.status === "created") return new Response("ok", { status: 200 });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: row, error: selectError } = await supabaseAdmin
            .from("payments")
            .select("id, status, amount_cents, provider_payment_id, song_payload")
            .eq("provider", "pushinpay")
            .eq("provider_payment_id", parsed.data.id)
            .maybeSingle();

          if (selectError) {
            console.error("[pushinpay-webhook] select error", selectError.message);
            return new Response("db error", { status: 500 });
          }
          if (!row) {
            console.warn("[pushinpay-webhook] payment not tracked", parsed.data.id);
            return new Response("payment not tracked", { status: 200 });
          }
          if (row.status === "approved") return new Response("ok", { status: 200 });

          if (parsed.data.status === "paid") {
            const { error } = await supabaseAdmin.rpc("confirm_payment", {
              _payment_id: row.id,
            });
            if (error) throw new Error(`confirm_payment: ${error.message}`);
            console.log("[pushinpay-webhook] confirmed", row.id);
          } else if (["canceled", "expired"].includes(parsed.data.status)) {
            const localStatus = parsed.data.status === "canceled" ? "cancelled" : "expired";
            const { error } = await supabaseAdmin
              .from("payments")
              .update({ status: localStatus })
              .eq("id", row.id)
              .eq("status", "pending");
            if (error) throw new Error(`payment status update: ${error.message}`);
            await removePaidUploadIfNeeded(
              supabaseAdmin,
              row.song_payload as Record<string, unknown> | null,
            );
          }

          return new Response("ok", { status: 200 });
        } catch (error) {
          const errorCode = getSafeErrorCode(error);
          console.error(
            "[pushinpay-webhook] error",
            error instanceof Error ? error.message : error,
          );
          return new Response(errorCode, {
            status: 500,
            headers: { "X-SongPIX-Error": errorCode },
          });
        }
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
