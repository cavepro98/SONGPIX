import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { pushinPayGetTransaction } from "@/lib/pushinpay.server";
import { enforceRateLimit } from "@/lib/security.server";

const WebhookSchema = z
  .object({
    id: z.string().min(1).max(200),
    value: z.number().int().positive().optional(),
    status: z.enum(["created", "paid", "canceled", "expired"]),
  })
  .passthrough();

async function removePaidUploadIfNeeded(
  supabaseAdmin: any,
  songPayload: Record<string, unknown> | null,
) {
  if (songPayload?.source !== "upload" || typeof songPayload.url !== "string") return;
  await supabaseAdmin.storage.from("song-uploads").remove([songPayload.url]);
}

// PushinPay has no signed webhook payload. Before changing financial state,
// fetch the transaction with our private token and verify its value and status.
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
            .select("id, status, amount_cents, song_payload")
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

          const transaction = await pushinPayGetTransaction(parsed.data.id);
          if (transaction.id !== parsed.data.id || transaction.value !== Number(row.amount_cents)) {
            console.error("[pushinpay-webhook] transaction mismatch", parsed.data.id);
            return new Response("transaction mismatch", { status: 200 });
          }

          if (transaction.status === "paid") {
            const { error: rpcError } = await supabaseAdmin.rpc("confirm_payment", {
              _payment_id: row.id,
            });
            if (rpcError) {
              console.error("[pushinpay-webhook] confirm_payment failed", rpcError.message);
              return new Response("rpc error", { status: 500 });
            }
            console.log("[pushinpay-webhook] confirmed", row.id);
          } else if (["canceled", "expired"].includes(transaction.status)) {
            const localStatus = transaction.status === "canceled" ? "cancelled" : "expired";
            const { error: updateError } = await supabaseAdmin
              .from("payments")
              .update({ status: localStatus })
              .eq("id", row.id)
              .eq("status", "pending");
            if (updateError) {
              console.error("[pushinpay-webhook] status update failed", updateError.message);
              return new Response("db error", { status: 500 });
            }
            await removePaidUploadIfNeeded(
              supabaseAdmin,
              row.song_payload as Record<string, unknown> | null,
            );
          }

          return new Response("ok", { status: 200 });
        } catch (error) {
          console.error(
            "[pushinpay-webhook] error",
            error instanceof Error ? error.message : error,
          );
          return new Response("error", { status: 500 });
        }
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
