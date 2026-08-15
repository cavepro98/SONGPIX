import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import appCss from "../styles.css?url";
import { isSupabaseClientConfigured, supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import bgNoise from "@/assets/bg-noise.gif";
import { getPublicSiteSettings } from "@/lib/public-settings.functions";

const DEFAULT_SEO = {
  platformName: "SongPIX",
  title: "SongPIX | pedidos de música com PIX para lives",
  description:
    "Crie uma fila de músicas para sua live, receba pedidos e organize apoios via PIX com o SongPIX.",
  keywords: "pedidos de música, fila de músicas, PIX para live, overlay para live, SongPIX",
  canonicalUrl: "https://songpix.app",
  ogImageUrl: null as string | null,
};

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35] mix-blend-overlay"
        style={{ backgroundImage: `url(${bgNoise})`, backgroundRepeat: "repeat" }}
      />
      <div className="app-panel relative max-w-md p-7 text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">O link que você abriu não existe mais.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-neon px-4 py-2 text-sm font-medium text-neon-foreground transition-colors hover:opacity-90"
          >
            Voltar pro início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35] mix-blend-overlay"
        style={{ backgroundImage: `url(${bgNoise})`, backgroundRepeat: "repeat" }}
      />
      <div className="app-panel relative max-w-md p-7 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tente novamente em alguns segundos.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-neon px-4 py-2 text-sm font-medium text-neon-foreground transition-colors hover:opacity-90"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    try {
      return await getPublicSiteSettings();
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => {
    const seo = loaderData ?? DEFAULT_SEO;
    const socialImage = seo.ogImageUrl
      ? [
          { property: "og:image", content: seo.ogImageUrl },
          { name: "twitter:image", content: seo.ogImageUrl },
        ]
      : [];

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: seo.title },
        { name: "description", content: seo.description },
        { name: "keywords", content: seo.keywords },
        { name: "theme-color", content: "#0f0f0f" },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: seo.canonicalUrl },
        { property: "og:site_name", content: seo.platformName },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: seo.title },
        { name: "twitter:description", content: seo.description },
        ...socialImage,
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "canonical", href: seo.canonicalUrl },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: seo.platformName,
            url: seo.canonicalUrl,
            description: seo.description,
            applicationCategory: "EntertainmentApplication",
            operatingSystem: "Web",
          }),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body className="professional-ui">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseClientConfigured()) return;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
      <SpeedInsights />
    </QueryClientProvider>
  );
}
