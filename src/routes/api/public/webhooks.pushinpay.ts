import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { syncPushinPayPayment, type PushinPayPaymentRow } from "@/lib/pushinpay-payment.server";
import { PushinPayApiError } from "@/lib/pushinpay.server";
import { enforceRateLimit } from "@/lib/security.server";

const WebhookSchema = z
  .object({
    id: z.string().min(1).max(200),
    value: z.number().int().positive().optional(),
    status: z.enum(["created", "paid", "canceled", "expired"]),
  })
  .passthrough();

function getSafeErrorCode(error: unknown): string {
  if (error instanceof PushinPayApiError) return `pushinpay-http-${error.status}`;
  const message = error instanceof Error ? error.message : "";
  const httpStatus = message.match(/PushinPay: HTTP (\d{3})/)?.[1];
  if (httpStatus) return `pushinpay-http-${httpStatus}`;
  if (message.includes("status inválido")) return "pushinpay-invalid-status";
  if (message.includes("Resposta inválida")) return "pushinpay-invalid-response";
  if (message.includes("transaction mismatch")) return "pushinpay-transaction-mismatch";
  if (message.startsWith("confirm_payment:")) return "confirmation-failed";
  if (message.startsWith("payment status update:")) return "status-update-failed";
  return "internal-error";
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

          await syncPushinPayPayment(supabaseAdmin, row as PushinPayPaymentRow);
          if (parsed.data.status === "paid") {
            console.log("[pushinpay-webhook] confirmed", row.id);
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
