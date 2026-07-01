import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

function startOfDayISO(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const todayStart = startOfDayISO(now);
    const days30 = new Date(now.getTime() - 30 * 86400000);
    const days30Start = startOfDayISO(days30);

    const [
      { data: profiles },
      { data: rooms },
      { data: items30 },
      { data: payments30 },
      { data: settings },
      { data: usersList },
    ] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, created_at"),
        supabaseAdmin.from("rooms").select("id, owner_id, is_open, created_at, name, slug"),
        supabaseAdmin
          .from("queue_items")
          .select("id, room_id, paid_amount_cents, status, created_at, played_at")
          .gte("created_at", days30Start),
        supabaseAdmin
          .from("payments")
          .select("id, room_id, amount_cents, commission_cents, net_cents, status, created_at, paid_at")
          .eq("status", "approved")
          .gte("created_at", days30Start),
        supabaseAdmin.from("platform_settings").select("commission_rate").eq("id", 1).maybeSingle(),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);

    const allRooms = rooms ?? [];
    const allProfiles = profiles ?? [];
    const items = items30 ?? [];
    const payments = payments30 ?? [];
    const commissionRate = Number(settings?.commission_rate ?? 0.1);
    const totalUsers = usersList?.users.length ?? allProfiles.length;

    const activeCreators = new Set(allRooms.map((r: any) => r.owner_id)).size;
    const openRooms = allRooms.filter((r: any) => r.is_open).length;

    const itemsToday = items.filter((i: any) => i.created_at >= todayStart);
    const paymentsToday = payments.filter((p: any) => (p.paid_at ?? p.created_at) >= todayStart);
    const volumeTodayCents = paymentsToday.reduce(
      (s: number, payment: any) => s + (payment.amount_cents || 0),
      0,
    );
    const commissionTodayCents = paymentsToday.reduce(
      (s: number, payment: any) => s + (payment.commission_cents || 0),
      0,
    );
    const ticketTodayCents =
      paymentsToday.length > 0 ? Math.round(volumeTodayCents / paymentsToday.length) : 0;

    const newUsersToday = allProfiles.filter((p: any) => p.created_at >= todayStart).length;

    // Daily series (30 days)
    const dailyMap = new Map<
      string,
      { date: string; receita: number; comissao: number; boosts: number; cadastros: number }
    >();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, receita: 0, comissao: 0, boosts: 0, cadastros: 0 });
    }
    for (const payment of payments) {
      const key = ((payment.paid_at ?? payment.created_at) as string).slice(0, 10);
      const row = dailyMap.get(key);
      if (row) {
        row.receita += payment.amount_cents || 0;
        row.comissao += payment.commission_cents || 0;
        row.boosts += 1;
      }
    }
    for (const p of allProfiles) {
      const key = (p.created_at as string).slice(0, 10);
      const row = dailyMap.get(key);
      if (row) row.cadastros += 1;
    }
    const daily = Array.from(dailyMap.values()).map((r) => ({
      ...r,
      receita: r.receita / 100,
      comissao: r.comissao / 100,
      ticket: r.boosts > 0 ? r.receita / r.boosts / 100 : 0,
    }));

    // Pedidos por hora (hoje)
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hora: `${String(h).padStart(2, "0")}h`,
      pedidos: 0,
    }));
    for (const i of itemsToday) {
      const h = new Date(i.created_at).getHours();
      hourly[h].pedidos += 1;
    }

    // Lives em andamento = salas abertas com item playing
    const playingRoomIds = new Set(
      items.filter((i: any) => i.status === "playing").map((i: any) => i.room_id),
    );
    const livesNow = allRooms.filter((r: any) => r.is_open && playingRoomIds.has(r.id)).length;

    const revenue30Cents = payments.reduce(
      (s: number, payment: any) => s + (payment.amount_cents || 0),
      0,
    );

    // Top salas por receita (30d)
    const roomRevenue = new Map<string, number>();
    const roomBoosts = new Map<string, number>();
    for (const payment of payments) {
      const roomId = payment.room_id;
      if (!roomId) continue;
      const v = payment.amount_cents || 0;
      if (v <= 0) continue;
      roomRevenue.set(roomId, (roomRevenue.get(roomId) || 0) + v);
      roomBoosts.set(roomId, (roomBoosts.get(roomId) || 0) + 1);
    }
    const roomNameById = new Map(allRooms.map((r: any) => [r.id, r.name ?? r.slug ?? r.id]));
    const topRooms = Array.from(roomRevenue.entries())
      .map(([id, cents]) => ({
        id,
        name: roomNameById.get(id) ?? id.slice(0, 6),
        receita: cents / 100,
        boosts: roomBoosts.get(id) || 0,
      }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 8);

    return {
      cards: {
        totalUsers,
        activeCreators,
        totalRooms: allRooms.length,
        openRooms,
        livesNow,
        songsToday: itemsToday.length,
        boostsToday: paymentsToday.length,
        volumeTodayCents,
        commissionTodayCents,
        ticketTodayCents,
        revenue30Cents,
        newUsersToday,
      },
      daily,
      hourly,
      topRooms,
      roomRevenue: Object.fromEntries(roomRevenue),
      commissionRate,
    };
  });
