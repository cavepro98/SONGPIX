type PublicCorsOptions = {
  methods: string[];
  contentType?: boolean;
};

const DEV_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>(DEV_ORIGINS);
  const publicSiteUrl = process.env.PUBLIC_SITE_URL;
  if (publicSiteUrl) {
    const normalized = normalizeOrigin(publicSiteUrl);
    if (normalized) origins.add(normalized);
  }

  for (const origin of (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const normalized = normalizeOrigin(origin);
    if (normalized) origins.add(normalized);
  }

  return origins;
}

export function publicCorsHeaders(request: Request, options: PublicCorsOptions): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": Array.from(new Set([...options.methods, "OPTIONS"])).join(", "),
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  });

  if (options.contentType ?? true) {
    headers.set("Content-Type", "application/json");
  }

  const requestOrigin = request.headers.get("Origin");
  if (!requestOrigin) return headers;

  const normalizedOrigin = normalizeOrigin(requestOrigin);
  if (normalizedOrigin && configuredOrigins().has(normalizedOrigin)) {
    headers.set("Access-Control-Allow-Origin", normalizedOrigin);
  }

  return headers;
}

export function publicOptionsResponse(request: Request, methods: string[]): Response {
  return new Response(null, {
    status: 204,
    headers: publicCorsHeaders(request, { methods, contentType: false }),
  });
}

export function publicJsonResponse(
  request: Request,
  data: unknown,
  init: ResponseInit & { methods: string[] },
): Response {
  const headers = publicCorsHeaders(request, { methods: init.methods });
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}
