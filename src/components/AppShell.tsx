import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ExternalLink,
  Headphones,
  Home,
  ListMusic,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import bgNoise from "@/assets/bg-noise.gif";

const SUPPORT_WHATSAPP_URL = "https://wa.me/5598984723943";

type AppShellProps = {
  active: "dashboard" | "room" | "withdrawals" | "admin";
  children: ReactNode;
  contextLabel?: string;
  roomSlug?: string | null;
  roomOpen?: boolean;
  topbarActions?: ReactNode;
};

type ShellContext = {
  displayName: string;
  roomSlug: string | null;
  isAdmin: boolean;
};

export function AppShell({
  active,
  children,
  roomSlug: suppliedRoomSlug,
  topbarActions,
}: AppShellProps) {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [shellContext, setShellContext] = useState<ShellContext>({
    displayName: "Minha conta",
    roomSlug: suppliedRoomSlug ?? null,
    isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadShellContext() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const [profileRes, roomRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("rooms")
          .select("slug")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle(),
      ]);

      if (cancelled) return;
      const fallbackName = user.email?.split("@")[0] || "Minha conta";
      setShellContext({
        displayName: profileRes.data?.display_name || fallbackName,
        roomSlug: suppliedRoomSlug ?? roomRes.data?.slug ?? null,
        isAdmin: !!roleRes.data,
      });
    }

    void loadShellContext();
    return () => {
      cancelled = true;
    };
  }, [suppliedRoomSlug]);

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) return toast.error(error.message);
    navigate({ to: "/" });
  }

  const roomSlug = suppliedRoomSlug ?? shellContext.roomSlug;
  const initials = shellContext.displayName.slice(0, 2).toUpperCase();
  const baseNavClass =
    "app-focus flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors";
  const navClass = (selected: boolean) =>
    `${baseNavClass} ${
      selected
        ? "bg-neon/10 text-neon ring-1 ring-inset ring-neon/20"
        : "text-muted-foreground hover:bg-surface hover:text-foreground"
    }`;

  const roomNav = roomSlug ? (
    <Link to="/rooms/$slug" params={{ slug: roomSlug }} className={navClass(active === "room")}>
      <Headphones className="h-4 w-4" /> Meu SongPIX
    </Link>
  ) : (
    <Link to="/dashboard" className={navClass(active === "room")}>
      <Headphones className="h-4 w-4" /> Meu SongPIX
    </Link>
  );

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.35] mix-blend-overlay"
        style={{
          backgroundImage: `url(${bgNoise})`,
          backgroundRepeat: "repeat",
          backgroundSize: "240px 240px",
        }}
      />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/80 bg-surface-2/95 backdrop-blur-md lg:flex">
        <Link to="/" className="flex h-16 items-center gap-2 border-b border-border/80 px-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-neon text-neon-foreground shadow-neon">
            <ListMusic className="h-4 w-4" />
          </div>
          <span className="brand-font text-lg font-bold tracking-tight">
            Song<span className="text-neon">PIX</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Plataforma
          </p>
          <Link to="/dashboard" className={navClass(active === "dashboard")}>
            <Home className="h-4 w-4" /> Início
          </Link>
          {roomNav}
          <Link to="/withdrawals" className={navClass(active === "withdrawals")}>
            <Wallet className="h-4 w-4" /> Saques
          </Link>
          {shellContext.isAdmin && (
            <Link to="/admin" className={navClass(active === "admin")}>
              <ShieldCheck className="h-4 w-4" /> Administração
            </Link>
          )}
        </nav>

        <div className="space-y-1 border-t border-border/80 p-3">
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className={navClass(false)}
          >
            <MessageCircle className="h-4 w-4" /> Suporte WhatsApp
          </a>
          <button onClick={handleSignOut} className={`${navClass(false)} w-full`}>
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="relative z-10 min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border/80 bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Link to="/" className="mr-3 flex items-center gap-2 lg:hidden">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-neon text-neon-foreground">
              <ListMusic className="h-4 w-4" />
            </div>
            <span className="brand-font hidden text-base font-bold sm:inline">SongPIX</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {topbarActions}
            {roomSlug && active !== "room" && (
              <a
                href={`/${roomSlug}`}
                target="_blank"
                rel="noreferrer"
                className="app-focus hidden h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-neon/50 hover:text-foreground sm:inline-flex"
              >
                <ExternalLink className="h-4 w-4" /> Página pública
              </a>
            )}
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              className="app-focus grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-xs font-bold transition hover:border-neon/50"
              aria-label="Abrir menu da conta"
            >
              <span className="hidden sm:inline">{initials}</span>
              <MoreHorizontal className="h-4 w-4 sm:hidden" />
            </button>
          </div>
        </header>

        {moreOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setMoreOpen(false)}
              aria-label="Fechar menu"
            />
            <div className="fixed right-4 top-[4.5rem] z-40 w-64 rounded-xl border border-border bg-popover p-2 shadow-2xl sm:right-6 lg:right-8">
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate text-sm font-semibold">{shellContext.displayName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Conta SongPIX</p>
              </div>
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <MessageCircle className="h-4 w-4" /> Suporte WhatsApp
              </a>
              {shellContext.isAdmin && (
                <Link
                  to="/admin"
                  className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
                >
                  <ShieldCheck className="h-4 w-4" /> Administração
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          </>
        )}

        <main className="mx-auto w-full max-w-7xl px-4 py-5 pb-24 sm:px-6 sm:py-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-3 border-t border-border bg-surface-2/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <Link
          to="/dashboard"
          className={`flex flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active === "dashboard" ? "text-neon" : "text-muted-foreground"}`}
        >
          <Home className="h-5 w-5" /> Início
        </Link>
        {roomSlug ? (
          <Link
            to="/rooms/$slug"
            params={{ slug: roomSlug }}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active === "room" ? "text-neon" : "text-muted-foreground"}`}
          >
            <Headphones className="h-5 w-5" /> Meu SongPIX
          </Link>
        ) : (
          <Link
            to="/dashboard"
            className="flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground"
          >
            <Headphones className="h-5 w-5" /> Meu SongPIX
          </Link>
        )}
        <Link
          to="/withdrawals"
          className={`flex flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active === "withdrawals" ? "text-neon" : "text-muted-foreground"}`}
        >
          <Wallet className="h-5 w-5" /> Saques
        </Link>
      </nav>
    </div>
  );
}
