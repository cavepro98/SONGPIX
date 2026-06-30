// Server-only Mercado Pago helpers. Never import from client code.

const MP_BASE = "https://api.mercadopago.com";

export type CreatePixInput = {
  amountReais: number;
  description: string;
  externalReference: string;
  notificationUrl: string;
  expirationMinutes: number;
  payer: { email: string; first_name?: string };
  idempotencyKey: string;
};

export type CreatePixResult = {
  id: string;
  status: string;
  qr_code: string;
  qr_code_base64: string;
  ticket_url: string | null;
  date_of_expiration: string;
};

function getToken(): string {
  const t = process.env.MP_ACCESS_TOKEN?.trim();
  if (!t) throw new Error("Mercado Pago não configurado");

  const looksLikeAccessToken =
    t.startsWith("APP_USR-") ||
    t.startsWith("TEST-") ||
    t.startsWith("APP-") ||
    t.startsWith("Bearer ");

  if (!looksLikeAccessToken || t.startsWith("Client_")) {
    throw new Error(
      "MP_ACCESS_TOKEN inválido. Use o Access Token real do Mercado Pago, não Client Secret.",
    );
  }

  return t.startsWith("Bearer ") ? t.slice("Bearer ".length).trim() : t;
}

export async function mpCreatePixPayment(input: CreatePixInput): Promise<CreatePixResult> {
  const expiresAt = new Date(Date.now() + input.expirationMinutes * 60_000).toISOString();
  const body = {
    transaction_amount: Number(input.amountReais.toFixed(2)),
    description: input.description.slice(0, 256),
    payment_method_id: "pix",
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    date_of_expiration: expiresAt,
    payer: {
      email: input.payer.email,
      first_name: input.payer.first_name?.slice(0, 80),
    },
  };

  const res = await fetch(`${MP_BASE}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || `Mercado Pago: HTTP ${res.status}`;
    throw new Error(msg);
  }

  const td = json.point_of_interaction?.transaction_data ?? {};
  return {
    id: String(json.id),
    status: json.status,
    qr_code: td.qr_code ?? "",
    qr_code_base64: td.qr_code_base64 ?? "",
    ticket_url: td.ticket_url ?? null,
    date_of_expiration: json.date_of_expiration ?? expiresAt,
  };
}

export async function mpGetPayment(
  providerPaymentId: string,
): Promise<{ status: string; status_detail: string | null }> {
  const res = await fetch(`${MP_BASE}/v1/payments/${encodeURIComponent(providerPaymentId)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`MP get payment: HTTP ${res.status}`);
  return { status: json.status, status_detail: json.status_detail ?? null };
}

// Validates Mercado Pago webhook signature.
// Header `x-signature` contains: `ts=...,v1=<hex>`. The signed manifest is:
//   id:<dataId>;request-id:<x-request-id>;ts:<ts>;
// HMAC-SHA256 with MP_WEBHOOK_SECRET, hex encoded.
export async function verifyMpSignature(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): Promise<boolean> {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!opts.xSignature || !opts.dataId) return false;

  const parts = Object.fromEntries(
    opts.xSignature.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    }),
  ) as Record<string, string>;
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId ?? ""};ts:${ts};`;
  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(v1, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
