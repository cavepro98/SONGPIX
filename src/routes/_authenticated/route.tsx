import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const [configRes, roleRes] = await Promise.all([
      fetch("/api/public/app-config")
        .then((res) => res.json())
        .catch(() => ({
          maintenanceMode: false,
        })),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle(),
    ]);

    const isAdmin = !!roleRes.data;
    if (configRes?.maintenanceMode && !isAdmin) {
      throw redirect({ to: "/auth" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
