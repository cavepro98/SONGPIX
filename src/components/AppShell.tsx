import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ListMusic, LogOut, Home, Menu, Wallet, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import bgNoise from "@/assets/bg-noise.gif";

type Room = { id: string; slug: string; name: string };
const SUPPORT_WHATSAPP_URL = "https://wa.me/5598984723943";

export function AppShell({
  active,
  children,
}: {
  active: "dashboard" | "withdrawals";
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("rooms")
        .select("id, slug, name")
        .eq("owner_id", uid)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      setRooms(data ?? []);
    })();
  }, []);

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) return toast.error(error.message);
    navigate({ to: "/" });
  }

  const navLink = (isActive: boolean) =>
    `flex items-center gap-3 border-l-2 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-widest ${
      isActive
        ? "border-neon bg-surface text-foreground"
        : "border-transparent text-muted-foreground hover:bg-surface hover:text-foreground"
    }`;

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
      <div className="relative z-10 flex min-h-screen flex-col md:flex-row">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b-2 border-border bg-surface-2/70 px-4 py-3 backdrop-blur-[1px] md:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNavOpen(true)}
              className="border border-border p-1.5 text-muted-foreground hover:border-neon hover:text-neon"
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Link to="/" className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center bg-neon text-neon-foreground">
                <ListMusic className="h-4 w-4" />
              </div>
              <span className="font-display text-base font-bold italic uppercase tracking-tighter">
                SongPIX
              </span>
            </Link>
          </div>
          <button
            onClick={handleSignOut}
            className="border border-border p-1.5 text-muted-foreground hover:border-neon hover:text-neon"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {navOpen && (
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm md:hidden"
            aria-label="Fechar menu"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r-2 border-border bg-surface-2/95 backdrop-blur-[1px] transition-transform md:static md:z-auto md:translate-x-0 md:bg-surface-2/70 ${navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
          onClick={() => setNavOpen(false)}
        >
          <Link to="/" className="mb-8 flex items-center gap-2 border-b border-border px-5 py-5">
            <div className="grid h-8 w-8 place-items-center bg-neon text-neon-foreground">
              <ListMusic className="h-4 w-4" />
            </div>
            <span className="font-display text-lg font-bold italic uppercase tracking-tighter">
              SongPIX
            </span>
          </Link>

          <nav className="space-y-1 px-3">
            <Link to="/dashboard" className={navLink(active === "dashboard")}>
              <Home className="h-4 w-4" /> Início
            </Link>
            <Link to="/withdrawals" className={navLink(active === "withdrawals")}>
              <Wallet className="h-4 w-4" /> Saques
            </Link>
          </nav>

          <div className="mt-8 px-3">
            <div className="border-b border-border px-2 pb-2 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              Estações · {rooms.length.toString().padStart(2, "0")}
            </div>
            <div className="mt-2 max-h-[40vh] space-y-0.5 overflow-y-auto">
              {rooms.map((r) => (
                <Link
                  key={r.id}
                  to="/rooms/$slug"
                  params={{ slug: r.slug }}
                  className="block truncate px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-neon"
                >
                  · {r.name}
                </Link>
              ))}
            </div>
          </div>

          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="mx-3 mb-2 mt-auto flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-neon hover:text-neon"
          >
            <MessageCircle className="h-4 w-4" /> Suporte WhatsApp
          </a>
          <button
            onClick={handleSignOut}
            className="mx-3 mb-4 flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-neon hover:text-neon"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="w-full px-4 py-6 sm:px-8 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
