import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BoostInput = z.object({
  itemId: z.string().uuid(),
  amountCents: z.number().int().positive(),
});

export const boostQueueItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BoostInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item, error: itemErr } = await supabaseAdmin
      .from("queue_items")
      .select(
        "id, status, room_id, paid_amount_cents, rooms!inner(min_boost_cents, max_boost_cents)",
      )
      .eq("id", data.itemId)
      .maybeSingle();
    if (itemErr) throw new Error(itemErr.message);
    if (!item) throw new Error("Música não encontrada");
    if (item.status !== "queued") throw new Error("Essa música não está mais na fila");

    const room = item.rooms as unknown as { min_boost_cents: number; max_boost_cents: number };
    const { data: settings } = await supabaseAdmin
      .from("platform_settings")
      .select("min_boost_global_cents, max_boost_global_cents")
      .eq("id", 1)
      .maybeSingle();
    const globalMinCents = Number(settings?.min_boost_global_cents ?? 100);
    const globalMaxCents = Number(settings?.max_boost_global_cents ?? 1_000_000);
    const effectiveMinCents = Math.max(Number(room.min_boost_cents ?? 0), globalMinCents);
    const effectiveMaxCents = Math.max(
      effectiveMinCents,
      Math.min(Number(room.max_boost_cents || globalMaxCents), Math.max(globalMinCents, globalMaxCents)),
    );
    if (data.amountCents < effectiveMinCents) {
      throw new Error("Valor abaixo do fura fila mínimo");
    }
    if (data.amountCents > effectiveMaxCents) {
      throw new Error("Valor acima do fura fila máximo");
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("queue_items")
      .update({ paid_amount_cents: item.paid_amount_cents + data.amountCents })
      .eq("id", data.itemId)
      .eq("status", "queued")
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);
    return updated;
  });
