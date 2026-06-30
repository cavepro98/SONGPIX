import { createFileRoute } from "@tanstack/react-router";
import { publicJsonResponse, publicOptionsResponse } from "@/lib/cors.server";
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
        const { data } = await supabaseAdmin
          .from("payments")
          .select("id, status, expires_at")
          .eq("id", id)
          .maybeSingle();
        if (!data) {
          return publicJsonResponse(
            request,
            { error: "not found" },
            { status: 404, methods: METHODS },
          );
        }
        return publicJsonResponse(request, data, { status: 200, methods: METHODS });
      },
    },
  },
});
