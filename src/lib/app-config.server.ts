import { MAX_PAYMENT_CENTS, MIN_PAYMENT_CENTS } from "@/lib/payment-limits";

export type PublicAppConfig = {
  allowSignups: boolean;
  maintenanceMode: boolean;
  minBoostGlobalCents: number;
  maxBoostGlobalCents: number;
};

export async function getPublicAppConfig(): Promise<PublicAppConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("allow_signups, maintenance_mode, min_boost_global_cents, max_boost_global_cents")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const minBoostGlobalCents = Math.min(
    MAX_PAYMENT_CENTS,
    Math.max(MIN_PAYMENT_CENTS, Number(data?.min_boost_global_cents ?? MIN_PAYMENT_CENTS)),
  );
  const maxBoostGlobalCents = Math.min(
    MAX_PAYMENT_CENTS,
    Number(data?.max_boost_global_cents ?? MAX_PAYMENT_CENTS),
  );

  return {
    allowSignups: !!data?.allow_signups,
    maintenanceMode: !!data?.maintenance_mode,
    minBoostGlobalCents,
    maxBoostGlobalCents: Math.max(minBoostGlobalCents, maxBoostGlobalCents),
  };
}

export async function assertPublicAppAvailable(opts?: { allowSignup?: boolean }) {
  const config = await getPublicAppConfig();

  if (config.maintenanceMode) {
    throw new Error("A plataforma está em manutenção no momento.");
  }

  if (opts?.allowSignup === false) {
    return config;
  }

  if (opts?.allowSignup && !config.allowSignups) {
    throw new Error("Novos cadastros estão desativados no momento.");
  }

  return config;
}
