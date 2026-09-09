type WebhookStatus = "created" | "paid" | "canceled" | "expired";

type WebhookPayload = {
  id: string;
  status: WebhookStatus;
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
  const payload = await readWebhookPayload(request);
  if (!payload) {
    console.warn("[pushinpay-webhook] invalid payload", request.headers.get("content-type"));
    return new Response("invalid payload", { status: 400 });
  }
  if (payload.status === "created") return new Response("ok", { status: 200 });

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let paymentQuery = supabaseAdmin
      .from("payments")
      .select("id, status, song_payload")
      .eq("provider", "pushinpay")
      .eq("provider_payment_id", payload.id);
    if (paymentId) paymentQuery = paymentQuery.eq("id", paymentId);
    const { data: row, error: selectError } = await paymentQuery.maybeSingle();

    if (selectError) {
      console.error("[pushinpay-webhook] select error", selectError.message);
      return new Response("db error", { status: 500 });
    }
    if (!row) {
      console.warn("[pushinpay-webhook] payment not tracked", payload.id);
      return new Response("payment not tracked", { status: 200 });
    }
    if (row.status === "approved") return new Response("ok", { status: 200 });

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
