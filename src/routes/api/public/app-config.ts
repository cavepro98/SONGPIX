import { createFileRoute } from "@tanstack/react-router";
import { getPublicAppConfig } from "@/lib/app-config.server";
import { publicJsonResponse, publicOptionsResponse } from "@/lib/cors.server";

const METHODS = ["GET"];

export const Route = createFileRoute("/api/public/app-config")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => publicOptionsResponse(request, METHODS),
      GET: async ({ request }) => {
        try {
          const config = await getPublicAppConfig();
          return publicJsonResponse(request, config, { status: 200, methods: METHODS });
        } catch (error) {
          return publicJsonResponse(
            request,
            {
              error: error instanceof Error ? error.message : "Erro ao carregar configurações",
            },
            { status: 500, methods: METHODS },
          );
        }
      },
    },
  },
});
