import { createFileRoute } from "@tanstack/react-router";
import { publicJsonResponse, publicOptionsResponse } from "@/lib/cors.server";
import { syncPushinPayPayment, type PushinPayPaymentRow } from "@/lib/pushinpay-payment.server";
import { enforceRateLimit, verifyPaymentStatusToken } from "@/lib/security.server";

const METHODS = ["GET"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/payments/$id/status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => publicOptionsResponse(request, METHODS),
      GET: async ({ params, request }) => {
        enforceRateLimit({ bucket: "payments-status", limit: 120, windowMs: 60_000 });
        const id = params.id;
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!UUID_RE.test(id)) {
          return publicJsonResponse(
            request,
            { error: "id inválido" },
            { status: 400, methods: METHODS },
          );
        }
        if (!verifyPaymentStatusToken(id, token)) {
          return publicJsonResponse(
            request,
            { error: "unauthorized" },
            { status: 401, methods: METHODS },
          );
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let { data } = await supabaseAdmin
          .from("payments")
          .select(
            "id, status, expires_at, provider, provider_payment_id, amount_cents, song_payload, updated_at",
          )
          .eq("id", id)
          .maybeSingle();
        if (!data) {
          return publicJsonResponse(
            request,
            { error: "not found" },
            { status: 404, methods: METHODS },
          );
        }

        if (
          data.status === "pending" &&
          data.provider === "pushinpay" &&
          data.provider_payment_id
        ) {
          const now = new Date();
          const refreshBefore = new Date(now.getTime() - 65_000).toISOString();
          const { data: claimed } = await supabaseAdmin
            .from("payments")
            .update({ updated_at: now.toISOString() })
            .eq("id", id)
            .eq("status", "pending")
            .lt("updated_at", refreshBefore)
            .select("id")
            .maybeSingle();

          if (claimed) {
            try {
              await syncPushinPayPayment(supabaseAdmin, data as PushinPayPaymentRow);
              const refreshed = await supabaseAdmin
                .from("payments")
                .select(
                  "id, status, expires_at, provider, provider_payment_id, amount_cents, song_payload, updated_at",
                )
                .eq("id", id)
                .maybeSingle();
              if (refreshed.data) data = refreshed.data;
            } catch (error) {
              console.error(
                "[payments-status] PushinPay sync failed",
                error instanceof Error ? error.message : error,
              );
            }
          }
        }

        return publicJsonResponse(
          request,
          { id: data.id, status: data.status, expires_at: data.expires_at },
          { status: 200, methods: METHODS },
        );
      },
    },
  },
});
