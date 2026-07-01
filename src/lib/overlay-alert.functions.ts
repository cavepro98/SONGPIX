import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { makeOverlayAlertTestMessage } from "@/lib/overlay-alert-test";

const TriggerOverlayAlertTestInput = z.object({
  roomSlug: z.string().trim().min(1).max(64),
});

export const triggerOverlayAlertTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => TriggerOverlayAlertTestInput.parse(input))
  .handler(async ({ context, data }) => {
    const { data: room, error: roomError } = await context.supabase
      .from("rooms")
      .select("id, slug, name, owner_id")
      .eq("slug", data.roomSlug)
      .is("archived_at", null)
      .maybeSingle();

    if (roomError) throw new Error(roomError.message);
    if (!room || room.owner_id !== context.userId) throw new Error("Sala não encontrada");

    const message = makeOverlayAlertTestMessage(room.slug, room.name ?? undefined);

    const { error } = await context.supabase.from("overlay_test_events").insert({
      room_id: room.id,
      kind: "support",
      payload: message,
    });

    if (error) throw new Error(error.message);
    return { ok: true, message };
  });
