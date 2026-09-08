// Server-only PushinPay helpers. Never import from client code.

const PUSHINPAY_BASE = "https://api.pushinpay.com.br/api";

type PushinPayStatus = "created" | "paid" | "canceled" | "expired";

export class PushinPayApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PushinPayApiError";
    this.status = status;
  }
}

export type CreatePushinPayPixInput = {
  valueCents: number;
  webhookUrl: string;
  idempotencyKey: string;
};

export type PushinPayTransaction = {
  id: string;
  status: PushinPayStatus;
  value: number;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string | null;
};

function getToken(): string {
  const token = process.env.PUSHINPAY_TOKEN?.trim();
  if (!token) throw new Error("PushinPay não configurada");
  return token.startsWith("Bearer ") ? token.slice("Bearer ".length).trim() : token;
}

function getErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const payload = data as Record<string, unknown>;
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
    if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  }
  return `PushinPay: HTTP ${status}`;
}

function normalizeBase64(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function parseStatus(value: unknown): PushinPayStatus {
  if (["created", "paid", "canceled", "expired"].includes(String(value))) {
    return String(value) as PushinPayStatus;
  }
  throw new Error("PushinPay retornou um status inválido");
}

function parseTransaction(data: unknown): PushinPayTransaction {
  if (!data || typeof data !== "object") throw new Error("Resposta inválida da PushinPay");
  const payload = data as Record<string, unknown>;
  const pixDetails =
    payload.pix_details && typeof payload.pix_details === "object"
      ? (payload.pix_details as Record<string, unknown>)
      : {};
  const id = typeof payload.id === "string" ? payload.id : "";
  const value = Number(payload.value);
  if (!id || !Number.isInteger(value) || value <= 0) {
    throw new Error("Resposta inválida da PushinPay");
  }

  const expiresAt =
    payload.expires_at ?? payload.expiration_date ?? pixDetails.expiration_date ?? null;

  return {
    id,
    status: parseStatus(payload.status),
    value,
    qrCode: typeof payload.qr_code === "string" ? payload.qr_code : "",
    qrCodeBase64: normalizeBase64(payload.qr_code_base64),
    expiresAt: typeof expiresAt === "string" && expiresAt ? expiresAt : null,
  };
}

export async function pushinPayCreatePix(
  input: CreatePushinPayPixInput,
): Promise<PushinPayTransaction> {
  const response = await fetch(`${PUSHINPAY_BASE}/pix/cashIn`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      value: input.valueCents,
      webhook_url: input.webhookUrl,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PushinPayApiError(response.status, getErrorMessage(data, response.status));
  }

  const transaction = parseTransaction(data);
  if (!transaction.qrCode) throw new Error("PushinPay não retornou o código PIX");
  return transaction;
}

export async function pushinPayGetTransaction(id: string): Promise<PushinPayTransaction> {
  const response = await fetch(`${PUSHINPAY_BASE}/transactions/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PushinPayApiError(response.status, getErrorMessage(data, response.status));
  }
  return parseTransaction(data);
}
