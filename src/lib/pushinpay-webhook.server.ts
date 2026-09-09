type WebhookStatus = "created" | "paid" | "canceled" | "expired";

type WebhookPayload = {
  id: string;
  status: WebhookStatus;
};

type PaymentRow = {
  id: string;
  status: string;
  song_payload: Record<string, unknown> | null;
  provider_payment_id: string | null;
  amount_cents: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeStatus(value: unknown): WebhookStatus | null {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["paid", "approved", "completed", "confirmed"].includes(status)) return "paid";
  if (["created", "pending", "waiting_payment"].includes(status)) return "created";
  if (["canceled", "cancelled"].includes(status)) return "canceled";
  if (status === "expired") return "expired";
  return null;
}

function extractPayload(value: unknown): WebhookPayload | null {
  const root = Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
  if (!root) return null;

  const candidates = [
    root,
    asRecord(root.data),
    asRecord(root.transaction),
    asRecord(root.payment),
    asRecord(root.pix),
    asRecord(root.payload),
  ].filter((candidate): candidate is Record<string, unknown> => candidate !== null);

  for (const candidate of candidates) {
    const id = String(
      candidate.id ?? candidate.transaction_id ?? candidate.transactionId ?? "",
    ).trim();
    const event = String(candidate.event ?? root.event ?? root.action ?? "").toLowerCase();
    const status =
      normalizeStatus(
        candidate.status ?? candidate.transaction_status ?? candidate.payment_status,
      ) ?? (event.includes("paid") || event.includes("approved") ? "paid" : null);
    if (id && id.length <= 200 && status) return { id, status };
  }

  return null;
}

async function readWebhookPayload(request: Request): Promise<WebhookPayload | null> {
  const raw = await request.text();
  if (!raw.trim()) return null;

  try {
    return extractPayload(JSON.parse(raw));
  } catch {
    const params = new URLSearchParams(raw);
    const formPayload = Object.fromEntries(params.entries());
    for (const key of ["data", "transaction", "payment", "payload"]) {
      const nested = formPayload[key];
      if (!nested) continue;
      try {
        formPayload[key] = JSON.parse(nested);
      } catch {
        // Keep the original form field when it is not JSON.
      }
    }
    return extractPayload(formPayload);
  }
}

function sameProviderId(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

async function reconcileFromPushinPay(row: PaymentRow): Promise<WebhookPayload> {
  if (!row.provider_payment_id) throw new Error("provider transaction id missing");

  const { pushinPayGetTransaction } = await import("@/lib/pushinpay.server");
  const transaction = await pushinPayGetTransaction(row.provider_payment_id);
  if (!sameProviderId(transaction.id, row.provider_payment_id)) {
    throw new Error("provider transaction id mismatch");
  }
  if (transaction.value !== row.amount_cents) {
    throw new Error("provider transaction value mismatch");
  }

  return { id: transaction.id, status: transaction.status };
}

function getSafeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("confirm_payment:")) return "confirmation-failed";
  if (message.startsWith("payment status update:")) return "status-update-failed";
  return "internal-error";
}

async function removePaidUploadIfNeeded(
  supabaseAdmin: any,
  songPayload: Record<string, unknown> | null,
) {
  if (songPayload?.source !== "upload" || typeof songPayload.url !== "string") return;
  await supabaseAdmin.storage.from("song-uploads").remove([songPayload.url]);
}

export async function processPushinPayWebhook(request: Request, paymentId?: string) {
  let payload = await readWebhookPayload(request);
  if (!payload && !paymentId) {
    console.warn("[pushinpay-webhook] invalid unsigned payload", {
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
    });
    return new Response("invalid payload", { status: 400 });
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let paymentQuery = supabaseAdmin
      .from("payments")
      .select("id, status, song_payload, provider_payment_id, amount_cents")
      .eq("provider", "pushinpay");
    paymentQuery = paymentId
      ? paymentQuery.eq("id", paymentId)
      : paymentQuery.eq("provider_payment_id", payload!.id);
    const { data, error: selectError } = await paymentQuery.maybeSingle();
    const row = data as PaymentRow | null;

    if (selectError) {
      console.error("[pushinpay-webhook] select error", selectError.message);
      return new Response("db error", { status: 500 });
    }
    if (!row) {
      console.warn("[pushinpay-webhook] payment not tracked", paymentId ?? payload?.id);
      return new Response("payment not tracked", { status: 200 });
    }
    if (row.status === "approved") return new Response("ok", { status: 200 });

    // Some PushinPay deliveries arrive without the documented JSON body. The
    // signed per-payment URL identifies the local payment, but provider status
    // and value are still verified before any financial state is changed.
    if (!payload || !sameProviderId(payload.id, row.provider_payment_id)) {
      console.warn("[pushinpay-webhook] reconciling delivery", {
        paymentId: row.id,
        hasParsedPayload: Boolean(payload),
        contentType: request.headers.get("content-type"),
        contentLength: request.headers.get("content-length"),
      });
      payload = await reconcileFromPushinPay(row);
    }

    if (payload.status === "created") return new Response("ok", { status: 200 });

    if (payload.status === "paid") {
      const { error } = await supabaseAdmin.rpc("confirm_payment", {
        _payment_id: row.id,
      });
      if (error) throw new Error(`confirm_payment: ${error.message}`);
      console.log("[pushinpay-webhook] confirmed", row.id);
    } else if (["canceled", "expired"].includes(payload.status)) {
      const localStatus = payload.status === "canceled" ? "cancelled" : "expired";
      const { error } = await supabaseAdmin
        .from("payments")
        .update({ status: localStatus })
        .eq("id", row.id)
        .eq("status", "pending");
      if (error) throw new Error(`payment status update: ${error.message}`);
      await removePaidUploadIfNeeded(
        supabaseAdmin,
        row.song_payload as Record<string, unknown> | null,
      );
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    const errorCode = getSafeErrorCode(error);
    console.error("[pushinpay-webhook] error", error instanceof Error ? error.message : error);
    return new Response(errorCode, {
      status: 500,
      headers: { "X-SongPIX-Error": errorCode },
    });
  }
}
