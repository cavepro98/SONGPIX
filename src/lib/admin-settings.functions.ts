import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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

export const getPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("platform_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const getBoostPriceLimits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("min_boost_global_cents, max_boost_global_cents")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const minBoostGlobalCents = Number(data?.min_boost_global_cents ?? 100);
    const maxBoostGlobalCents = Number(data?.max_boost_global_cents ?? 1_000_000);
    return {
      minBoostGlobalCents,
      maxBoostGlobalCents: Math.max(minBoostGlobalCents, maxBoostGlobalCents),
    };
  });

const UpdateInput = z.object({
  platform_name: z.string().trim().min(1).max(60),
  commission_rate: z.number().min(0).max(1),
  min_boost_global_cents: z.number().int().min(0),
  max_boost_global_cents: z.number().int().min(0),
  min_withdrawal_cents: z.number().int().min(100),
  allow_signups: z.boolean(),
  maintenance_mode: z.boolean(),
  support_email: z.string().email().or(z.literal("")).nullable().optional(),
});

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.max_boost_global_cents < data.min_boost_global_cents) {
      throw new Error("Fura fila máximo deve ser maior ou igual ao mínimo");
    }
    const { error } = await context.supabase
      .from("platform_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
