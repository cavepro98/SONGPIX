import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { assertPublicAppAvailable } from "@/lib/app-config.server";
import { publicJsonResponse, publicOptionsResponse } from "@/lib/cors.server";
import { enforceRateLimit } from "@/lib/security.server";

const METHODS = ["POST"];

const SignupSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(6).max(128),
  displayName: z.string().trim().min(1).max(40),
});

export const Route = createFileRoute("/api/public/auth/signup")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => publicOptionsResponse(request, METHODS),
      POST: async ({ request }) => {
        try {
          enforceRateLimit({ bucket: "auth-signup", limit: 8, windowMs: 60_000 });
          await assertPublicAppAvailable({ allowSignup: true });
          const body = SignupSchema.parse(await request.json());
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
            user_metadata: {
              display_name: body.displayName,
              full_name: body.displayName,
            },
          });

          if (error) {
            return publicJsonResponse(
              request,
              { error: error.message },
              {
                status: 400,
                methods: METHODS,
              },
            );
          }

          return publicJsonResponse(request, { ok: true }, { status: 200, methods: METHODS });
        } catch (error) {
          return publicJsonResponse(
            request,
            { error: error instanceof Error ? error.message : "Erro no cadastro" },
            { status: 400, methods: METHODS },
          );
        }
      },
    },
  },
});
