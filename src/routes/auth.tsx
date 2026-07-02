import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isSupabaseClientConfigured, supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, ListMusic, Loader2, Radio, ShieldCheck, Zap } from "lucide-react";
import bgNoise from "@/assets/bg-noise.gif";

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
  const supabaseConfigured = isSupabaseClientConfigured();

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

      if (!supabaseConfigured) return;

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
  }, [navigate, supabaseConfigured]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!supabaseConfigured) {
        throw new Error("Supabase não está configurado no ambiente de produção.");
      }

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

  const submitDisabled =
    loading ||
    configLoading ||
    !supabaseConfigured ||
    !!appConfig?.maintenanceMode ||
    (mode === "signup" && !!appConfig && !appConfig.allowSignups);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35] mix-blend-overlay"
        style={{
          backgroundImage: `url(${bgNoise})`,
          backgroundRepeat: "repeat",
          backgroundSize: "240px 240px",
        }}
      />
      <div className="pointer-events-none absolute -left-28 top-24 h-72 w-72 rounded-full bg-neon/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-16 h-80 w-80 rounded-full bg-neon/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden animate-[soft-in_0.8s_ease-out_both] lg:block">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="grid h-11 w-11 place-items-center bg-neon text-neon-foreground shadow-neon">
              <ListMusic className="h-5 w-5" />
            </div>
            <span className="font-display text-2xl font-black italic uppercase tracking-tighter">
              SongPIX
            </span>
          </Link>

          <div className="mt-14 max-w-xl">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-neon">
              painel da live
            </span>
            <h1 className="mt-4 font-display text-5xl font-black italic uppercase leading-[0.9] tracking-tighter xl:text-6xl">
              Sua fila de música com PIX ao vivo.
            </h1>
            <p className="mt-5 max-w-lg text-base font-medium leading-relaxed text-muted-foreground">
              Crie salas, receba pedidos, organize fura fila, configure overlays e acompanhe seus
              ganhos em um painel único.
            </p>
          </div>

          <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              { icon: Radio, title: "Salas ao vivo", text: "link público por sala" },
              { icon: Zap, title: "Fura fila", text: "prioridade por donate" },
              { icon: ShieldCheck, title: "Controle", text: "dono gerencia tudo" },
            ].map((item) => (
              <div key={item.title} className="border border-border bg-surface/75 p-4">
                <item.icon className="h-4 w-4 text-neon" />
                <div className="mt-4 font-display text-xs font-bold uppercase tracking-tight">
                  {item.title}
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md animate-[soft-in_0.7s_ease-out_both]">
          <Link to="/" className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <div className="grid h-10 w-10 place-items-center bg-neon text-neon-foreground">
              <ListMusic className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-black italic uppercase tracking-tighter">
              SongPIX
            </span>
          </Link>

          <div className="border border-border bg-surface/90 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur sm:p-7">
            <div className="mb-6 grid grid-cols-2 border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`px-3 py-2 font-display text-[10px] font-black uppercase tracking-widest transition ${
                  mode === "signin"
                    ? "bg-neon text-neon-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                disabled={!!appConfig?.maintenanceMode}
                onClick={() => setMode("signup")}
                className={`px-3 py-2 font-display text-[10px] font-black uppercase tracking-widest transition disabled:opacity-40 ${
                  mode === "signup"
                    ? "bg-neon text-neon-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cadastro
              </button>
            </div>

            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-neon">
                {mode === "signin" ? "acesso do dono" : "nova conta"}
              </span>
              <h1 className="mt-2 font-display text-3xl font-black italic uppercase leading-none tracking-tighter">
                {mode === "signin" ? "Entrar no painel" : "Criar sua sala"}
              </h1>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                {mode === "signin"
                  ? "Acesse suas salas, overlays, pedidos e saques."
                  : "Cadastre-se para começar a receber pedidos de música."}
              </p>
            </div>

            {!configLoading && appConfig?.maintenanceMode && (
              <div className="mt-6 border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200">
                A plataforma está em manutenção. O acesso comum está temporariamente indisponível.
              </div>
            )}

            {!supabaseConfigured && (
              <div className="mt-6 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
                Supabase não está configurado neste deploy. Cadastre as variáveis públicas e de
                servidor na Vercel.
              </div>
            )}

            {!configLoading && mode === "signup" && appConfig && !appConfig.allowSignups && (
              <div className="mt-6 border border-border bg-background px-4 py-3 text-sm font-medium text-muted-foreground">
                Novos cadastros estão desativados no momento.
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Apelido / @ do usuário
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="@seudj"
                    className="mt-1 w-full border border-input bg-background px-4 py-3 text-sm font-bold outline-none transition focus:border-neon focus:ring-1 focus:ring-neon"
                  />
                </div>
              )}
              <div>
                <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  className="mt-1 w-full border border-input bg-background px-4 py-3 text-sm font-bold outline-none transition focus:border-neon focus:ring-1 focus:ring-neon"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="mínimo 6 caracteres"
                  className="mt-1 w-full border border-input bg-background px-4 py-3 text-sm font-bold outline-none transition focus:border-neon focus:ring-1 focus:ring-neon"
                />
              </div>
              <button
                type="submit"
                disabled={submitDisabled}
                className="group flex w-full items-center justify-center gap-2 bg-neon px-4 py-3.5 font-display text-xs font-black uppercase tracking-widest text-neon-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Aguarde" : mode === "signin" ? "Entrar agora" : "Criar conta"}
                {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
              </button>
            </form>

            <button
              type="button"
              disabled={!!appConfig?.maintenanceMode}
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="mt-6 w-full border border-border bg-background px-4 py-3 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition hover:border-neon hover:text-neon disabled:opacity-40"
            >
              {mode === "signin" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
