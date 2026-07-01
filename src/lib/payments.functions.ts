import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoomPaymentsInput = z.object({
  roomId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const listRoomPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RoomPaymentsInput.parse(input))
  .handler(async ({ data, context }) => {
    // RLS already restricts by owner; double-check ownership for clarity.
    const { data: room, error: rerr } = await context.supabase
      .from("rooms")
      .select("id, owner_id")
      .eq("id", data.roomId)
      .maybeSingle();
    if (rerr) throw new Error(rerr.message);
    if (!room || room.owner_id !== context.userId) throw new Error("Sala não encontrada");

    const [paymentsRes, totalsRes] = await Promise.all([
      context.supabase
        .from("payments")
        .select(
          "id, payer_name, amount_cents, commission_cents, net_cents, status, created_at, paid_at, song_payload",
        )
        .eq("room_id", data.roomId)
        .order("created_at", { ascending: false })
        .limit(data.limit ?? 50),
      context.supabase
        .from("payments")
        .select("amount_cents, commission_cents, net_cents")
        .eq("room_id", data.roomId)
        .eq("status", "approved"),
    ]);
    const { data: payments, error } = paymentsRes;
    if (error) throw new Error(error.message);
    if (totalsRes.error) throw new Error(totalsRes.error.message);

    const approvedPayments = totalsRes.data ?? [];

    return {
      totals: {
        gross: approvedPayments.reduce((sum, payment) => sum + Number(payment.amount_cents || 0), 0),
        net: approvedPayments.reduce((sum, payment) => sum + Number(payment.net_cents || 0), 0),
        commission: approvedPayments.reduce(
          (sum, payment) => sum + Number(payment.commission_cents || 0),
          0,
        ),
      },
      payments: payments ?? [],
    };
  });
