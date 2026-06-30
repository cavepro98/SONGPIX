import { timingSafeEqual, createHmac } from "crypto";
import { getRequest } from "@tanstack/react-start/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowMs: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function getHeader(headers: Headers, key: string): string | null {
  const value = headers.get(key);
  return value?.trim() || null;
}

export function getClientIpFromRequest(request?: Request | null): string {
  const headers = request?.headers;
  if (!headers) return "unknown";

  const forwardedFor = getHeader(headers, "x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  const candidates = [
    getHeader(headers, "cf-connecting-ip"),
    getHeader(headers, "x-real-ip"),
    getHeader(headers, "fly-client-ip"),
  ];

  return candidates.find(Boolean) || "unknown";
}

export function enforceRateLimit(options: RateLimitOptions) {
  const request = getRequest();
  const ip = getClientIpFromRequest(request);
  const now = Date.now();
  const key = `${options.bucket}:${ip}`;
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (current.count >= options.limit) {
    throw new Error("Muitas tentativas. Tente novamente em instantes.");
  }

  current.count += 1;
  rateLimitStore.set(key, current);
}

function getPaymentStatusSecret(): string {
  return (
    process.env.PAYMENT_STATUS_SECRET ||
    process.env.MP_WEBHOOK_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

export function createPaymentStatusToken(paymentId: string): string {
  const secret = getPaymentStatusSecret();
  if (!secret) throw new Error("PAYMENT_STATUS_SECRET não configurado");
  return createHmac("sha256", secret).update(paymentId).digest("hex");
}

export function verifyPaymentStatusToken(paymentId: string, token: string | null): boolean {
  if (!token) return false;
  const secret = getPaymentStatusSecret();
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(paymentId).digest("hex");
  try {
    const a = Buffer.from(token, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
