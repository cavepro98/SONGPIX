import { createFileRoute } from "@tanstack/react-router";
import { processPushinPayWebhook } from "@/lib/pushinpay-webhook.server";
import { enforceRateLimit, verifyPaymentStatusToken } from "@/lib/security.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/webhooks/pushinpay/$paymentId/$token")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        enforceRateLimit({ bucket: "pushinpay-webhook", limit: 60, windowMs: 60_000 });
        if (
          !UUID_RE.test(params.paymentId) ||
          !verifyPaymentStatusToken(params.paymentId, params.token)
        ) {
          return new Response("unauthorized", { status: 401 });
        }
        return processPushinPayWebhook(request, params.paymentId);
      },
    },
  },
});
