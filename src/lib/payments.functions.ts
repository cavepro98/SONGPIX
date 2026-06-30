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
      .select("id, owner_id, total_gross_cents, total_net_cents, total_commission_cents")
      .eq("id", data.roomId)
      .maybeSingle();
    if (rerr) throw new Error(rerr.message);
    if (!room || room.owner_id !== context.userId) throw new Error("Sala não encontrada");

    const { data: payments, error } = await context.supabase
      .from("payments")
      .select(
        "id, payer_name, amount_cents, commission_cents, net_cents, status, created_at, paid_at, song_payload",
      )
      .eq("room_id", data.roomId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);

    return {
      totals: {
        gross: room.total_gross_cents ?? 0,
        net: room.total_net_cents ?? 0,
        commission: room.total_commission_cents ?? 0,
      },
      payments: payments ?? [],
    };
  });
