import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ListMusic } from "lucide-react";

type PublicAppConfig = {
  allowSignups: boolean;
  maintenanceMode: boolean;
};

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | SongPIX" },
      { name: "description", content: "Entre para criar sua sala de fila de músicas." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [appConfig, setAppConfig] = useState<PublicAppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let config: PublicAppConfig = { allowSignups: true, maintenanceMode: false };
      try {
        const res = await fetch("/api/public/app-config");
        const data = await res.json();
        config = {
          allowSignups: !!data.allowSignups,
          maintenanceMode: !!data.maintenanceMode,
        };
      } catch {
        config = { allowSignups: true, maintenanceMode: false };
      }

      if (!mounted) return;
      setAppConfig(config);
      setConfigLoading(false);

      const { data } = await supabase.auth.getSession();
      if (!data.session?.user || !mounted) return;
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      const isAdmin = !!role;
      if (config.maintenanceMode && !isAdmin) return;
      navigate({ to: "/dashboard" });
    })();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (appConfig?.maintenanceMode)
          throw new Error("A plataforma está em manutenção no momento.");
        if (appConfig && !appConfig.allowSignups) {
          throw new Error("Novos cadastros estão desativados no momento.");
        }

        const signupRes = await fetch("/api/public/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: name || email.split("@")[0],
          }),
        });
        const signupData = await signupRes.json().catch(() => ({}));
        if (!signupRes.ok) {
          throw new Error(signupData?.error ?? "Falha ao criar conta");
        }

        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          toast.success("Conta criada! Entre com suas credenciais.");
          setMode("signin");
        } else {
          navigate({ to: "/dashboard" });
        }
      } else {
        if (appConfig?.maintenanceMode) {
          throw new Error("A plataforma está em manutenção no momento.");
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <Link to="/" className="mb-10 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-neon text-neon-foreground">
            <ListMusic className="h-5 w-5" />
          </div>
          <span className="font-display text-2xl font-bold">SongPIX</span>
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-10 shadow-xl">
          <h1 className="font-display text-3xl font-semibold">
            {mode === "signin" ? "Entrar" : "Criar conta"}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            {mode === "signin"
              ? "Acesse seu painel de salas"
              : "Comece a receber pedidos de música em segundos"}
          </p>

          {!configLoading && appConfig?.maintenanceMode && (
            <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              A plataforma está em manutenção. O acesso comum está temporariamente indisponível.
            </div>
          )}

          {!configLoading && mode === "signup" && appConfig && !appConfig.allowSignups && (
            <div className="mt-6 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
              Novos cadastros estão desativados no momento.
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-sm text-muted-foreground">Nome de exibição</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="DJ Noix"
                  className="mt-1 w-full rounded-md border border-input bg-surface-2 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-neon"
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-surface-2 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-neon"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-surface-2 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-neon"
              />
            </div>
            <button
              type="submit"
              disabled={
                loading ||
                configLoading ||
                !!appConfig?.maintenanceMode ||
                (mode === "signup" && !!appConfig && !appConfig.allowSignups)
              }
              className="w-full rounded-md bg-neon px-4 py-3 text-base font-semibold text-neon-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <button
            type="button"
            disabled={!!appConfig?.maintenanceMode}
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "Não tem conta? Criar uma agora" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
