import { pushinPayGetTransaction } from "@/lib/pushinpay.server";

export type PushinPayPaymentRow = {
  id: string;
  status: string;
  amount_cents: number;
  provider_payment_id: string;
  song_payload: Record<string, unknown> | null;
};

async function removePaidUploadIfNeeded(
  supabaseAdmin: any,
  songPayload: Record<string, unknown> | null,
) {
  if (songPayload?.source !== "upload" || typeof songPayload.url !== "string") return;
  await supabaseAdmin.storage.from("song-uploads").remove([songPayload.url]);
}

export async function syncPushinPayPayment(supabaseAdmin: any, row: PushinPayPaymentRow) {
  if (row.status === "approved") return;

  const transaction = await pushinPayGetTransaction(row.provider_payment_id);
  if (
    transaction.id.toLowerCase() !== row.provider_payment_id.toLowerCase() ||
    transaction.value !== Number(row.amount_cents)
  ) {
    throw new Error("PushinPay transaction mismatch");
  }

  if (transaction.status === "paid") {
    const { error } = await supabaseAdmin.rpc("confirm_payment", {
      _payment_id: row.id,
    });
    if (error) throw new Error(`confirm_payment: ${error.message}`);
    return;
  }

  if (["canceled", "expired"].includes(transaction.status)) {
    const localStatus = transaction.status === "canceled" ? "cancelled" : "expired";
    const { error } = await supabaseAdmin
      .from("payments")
      .update({ status: localStatus })
      .eq("id", row.id)
      .eq("status", "pending");
    if (error) throw new Error(`payment status update: ${error.message}`);
    await removePaidUploadIfNeeded(supabaseAdmin, row.song_payload);
  }
}
