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
    if (data.amountCents < room.min_boost_cents) {
      throw new Error("Valor abaixo do fura fila mínimo");
    }
    if (room.max_boost_cents && data.amountCents > room.max_boost_cents) {
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
