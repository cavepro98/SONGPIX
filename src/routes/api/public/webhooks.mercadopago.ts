import { createFileRoute } from "@tanstack/react-router";
import { mpGetPayment, verifyMpSignature } from "@/lib/mercadopago.server";
import { enforceRateLimit } from "@/lib/security.server";

// MP webhook: validate the webhook signature first, then re-fetch the payment
// from Mercado Pago with our access token before changing local state.
export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        enforceRateLimit({ bucket: "mp-webhook", limit: 60, windowMs: 60_000 });
        const url = new URL(request.url);
        const xSignature = request.headers.get("x-signature");
        const xRequestId = request.headers.get("x-request-id");

        let dataId =
          url.searchParams.get("data.id") ||
          url.searchParams.get("id") ||
          url.searchParams.get("topic_id");

        const raw = await request.text();
        let payload: Record<string, unknown> = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          /* ignore */
        }
        if (!dataId) {
          dataId = String(
            (payload as any)?.data?.id ?? (payload as any)?.resource ?? (payload as any)?.id ?? "",
          );
        }

        const type =
          (payload as any)?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
        const liveMode = (payload as any)?.live_mode;
        if (type && !String(type).includes("payment")) {
          return new Response("ignored", { status: 200 });
        }
        // Mercado Pago dashboard "Simular notificacoes" uses fake resource ids
        // and live_mode=false. Treat those probes as successful URL checks.
        if (liveMode === false) {
          console.log("[mp-webhook] test notification acknowledged");
          return new Response("test ok", { status: 200 });
        }
        if (!dataId) {
          console.warn("[mp-webhook] missing data id");
          return new Response("missing id", { status: 200 });
        }

        const signatureOk = await verifyMpSignature({
          xSignature,
          xRequestId,
          dataId,
        });
        if (!signatureOk) {
          console.warn("[mp-webhook] invalid signature");
          return new Response("invalid signature", { status: 401 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: row, error: selErr } = await supabaseAdmin
            .from("payments")
            .select("id, status")
            .eq("provider_payment_id", dataId)
            .maybeSingle();
          if (selErr) {
            console.error("[mp-webhook] select error", selErr.message);
            return new Response("db error", { status: 500 });
          }
          if (!row) {
            console.warn("[mp-webhook] payment not tracked", dataId);
            // 200 so MP stops retrying for events that don't belong to us.
            return new Response("payment not tracked", { status: 200 });
          }

          // Authoritative status comes from MP API, authenticated with our access token.
          const mp = await mpGetPayment(dataId);

          if (mp.status === "approved") {
            if (row.status !== "approved") {
              const { error: rpcErr } = await supabaseAdmin.rpc("confirm_payment", {
                _payment_id: row.id,
              });
              if (rpcErr) {
                console.error("[mp-webhook] confirm_payment failed", rpcErr.message);
                return new Response("rpc error", { status: 500 });
              }
              console.log("[mp-webhook] confirmed", row.id);
            }
          } else if (["rejected", "cancelled", "refunded", "expired"].includes(mp.status)) {
            await supabaseAdmin.from("payments").update({ status: mp.status }).eq("id", row.id);
            console.log("[mp-webhook] status update", row.id, mp.status);
          }
          return new Response("ok", { status: 200 });
        } catch (e) {
          console.error("[mp-webhook] error", e instanceof Error ? e.message : e);
          return new Response("error", { status: 500 });
        }
      },
      // MP sometimes pings with GET to validate the URL.
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
