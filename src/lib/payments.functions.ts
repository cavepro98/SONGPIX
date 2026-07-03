import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoomPaymentsInput = z.object({
  roomId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
});

const AdminPaymentsInput = z.object({
  limit: z.number().int().min(1).max(500).optional(),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

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

export const listAllPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AdminPaymentsInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [paymentsRes, totalsRes] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select(
          "id, room_id, owner_id, payer_name, payer_email, amount_cents, commission_cents, net_cents, provider, provider_payment_id, status, created_at, paid_at, song_payload",
        )
        .order("created_at", { ascending: false })
        .limit(data.limit ?? 500),
      supabaseAdmin
        .from("payments")
        .select("amount_cents, commission_cents, net_cents, status")
        .eq("status", "approved"),
    ]);

    if (paymentsRes.error) throw new Error(paymentsRes.error.message);
    if (totalsRes.error) throw new Error(totalsRes.error.message);

    const payments = paymentsRes.data ?? [];
    const ownerIds = [...new Set(payments.map((p: any) => p.owner_id).filter(Boolean))];
    const roomIds = [...new Set(payments.map((p: any) => p.room_id).filter(Boolean))];

    const [{ data: profiles }, { data: rooms }] = await Promise.all([
      ownerIds.length
        ? supabaseAdmin.from("profiles").select("id, display_name").in("id", ownerIds)
        : Promise.resolve({ data: [] as any[] }),
      roomIds.length
        ? supabaseAdmin.from("rooms").select("id, name, slug").in("id", roomIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const roomMap = new Map((rooms ?? []).map((r: any) => [r.id, r]));
    const approved = totalsRes.data ?? [];

    return {
      totals: {
        gross: approved.reduce((sum: number, p: any) => sum + Number(p.amount_cents || 0), 0),
        net: approved.reduce((sum: number, p: any) => sum + Number(p.net_cents || 0), 0),
        commission: approved.reduce(
          (sum: number, p: any) => sum + Number(p.commission_cents || 0),
          0,
        ),
        approvedCount: approved.length,
      },
      payments: payments.map((p: any) => {
        const room = roomMap.get(p.room_id);
        const profile = profileMap.get(p.owner_id);
        return {
          ...p,
          room_name: room?.name ?? null,
          room_slug: room?.slug ?? null,
          owner_display_name: profile?.display_name ?? null,
        };
      }),
    };
  });
