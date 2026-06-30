export type PublicAppConfig = {
  allowSignups: boolean;
  maintenanceMode: boolean;
};

export async function getPublicAppConfig(): Promise<PublicAppConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("allow_signups, maintenance_mode")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    allowSignups: !!data?.allow_signups,
    maintenanceMode: !!data?.maintenance_mode,
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
