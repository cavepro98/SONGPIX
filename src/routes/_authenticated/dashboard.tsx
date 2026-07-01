import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ListMusic,
  Plus,
  LogOut,
  Trash2,
  Home,
  Radio,
  Share2,
  Music2,
  ArrowUpRight,
  ImagePlus,
  X,
  Menu,
  Wallet,
  Pencil,
  MessageCircle,
  Zap,
} from "lucide-react";
import bgNoise from "@/assets/bg-noise.gif";
import { useCoverUrl } from "@/lib/use-cover-url";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getBoostPriceLimits } from "@/lib/admin-settings.functions";
import { getMyEarnings } from "@/lib/withdrawals.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Minhas salas | SongPIX" }] }),
  component: Dashboard,
});

type Room = {
  id: string;
  slug: string;
  name: string;
  is_open: boolean;
  created_at: string;
  cover_url: string | null;
  total_net_cents?: number;
  total_gross_cents?: number;
};

const DASHBOARD_WELCOME_STORAGE_KEY = "songpix-dashboard-welcome-seen";
const SUPPORT_WHATSAPP_URL = "https://wa.me/5598984723943";
const DEFAULT_BOOST_LIMITS = {
  minBoostGlobalCents: 100,
  maxBoostGlobalCents: 1_000_000,
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function formatCents(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Dashboard() {
  const navigate = useNavigate();
  const fetchEarnings = useServerFn(getMyEarnings);
  const fetchBoostLimits = useServerFn(getBoostPriceLimits);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [availableCents, setAvailableCents] = useState(0);
  const [boostLimits, setBoostLimits] = useState(DEFAULT_BOOST_LIMITS);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [existingCoverPath, setExistingCoverPath] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [minBoost, setMinBoost] = useState("1.00");
  const [maxBoost, setMaxBoost] = useState("500.00");
  const [maxDurationMin, setMaxDurationMin] = useState("10");
  const [allowYoutube, setAllowYoutube] = useState(true);
  const [allowSpotify, setAllowSpotify] = useState(true);
  const [allowSoundcloud, setAllowSoundcloud] = useState(true);
  const [allowUpload, setAllowUpload] = useState(false);
  const [requirePayment, setRequirePayment] = useState(false);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setRooms([]);
      setAvailableCents(0);
      setLoading(false);
      return;
    }
    const [roomResult, earnings, limits] = await Promise.all([
      supabase
        .from("rooms")
        .select(
          "id, slug, name, is_open, created_at, cover_url, total_net_cents, total_gross_cents",
        )
        .eq("owner_id", uid)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      fetchEarnings().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar saldo");
        return null;
      }),
      fetchBoostLimits().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar limites do Fura fila");
        return DEFAULT_BOOST_LIMITS;
      }),
    ]);
    const { data, error } = roomResult;
    if (error) toast.error(error.message);
    else setRooms((data ?? []) as Room[]);
    setAvailableCents(Number(earnings?.availableCents ?? 0));
    setBoostLimits(limits ?? DEFAULT_BOOST_LIMITS);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(DASHBOARD_WELCOME_STORAGE_KEY)) {
      setWelcomeOpen(true);
    }
  }, []);

  function closeWelcome() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DASHBOARD_WELCOME_STORAGE_KEY, "1");
    }
    setWelcomeOpen(false);
  }

  function createFirstRoomFromWelcome() {
    closeWelcome();
    setOpen(true);
  }

  function resetForm() {
    setName("");
    setDescription("");
    setCoverFile(null);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
    setExistingCoverPath(null);
    setMinBoost((boostLimits.minBoostGlobalCents / 100).toFixed(2));
    setMaxBoost((boostLimits.maxBoostGlobalCents / 100).toFixed(2));
    setMaxDurationMin("10");
    setAllowYoutube(true);
    setAllowSpotify(true);
    setAllowSoundcloud(true);
    setAllowUpload(false);
    setRequirePayment(false);
    setEditId(null);
  }

  async function openEdit(roomId: string) {
    const { data, error } = await supabase
      .from("rooms")
      .select(
        "id, name, description, cover_url, min_boost_cents, max_boost_cents, max_duration_sec, allow_youtube, allow_spotify, allow_soundcloud, allow_upload, require_payment",
      )
      .eq("id", roomId)
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message ?? "Sala não encontrada");
      return;
    }
    setEditId(data.id);
    setName(data.name ?? "");
    setDescription(data.description ?? "");
    setCoverFile(null);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
    setExistingCoverPath(data.cover_url ?? null);
    const minBoostCents = Math.max(
      boostLimits.minBoostGlobalCents,
      Number(data.min_boost_cents ?? boostLimits.minBoostGlobalCents),
    );
    const maxBoostCents = Math.min(
      boostLimits.maxBoostGlobalCents,
      Number(data.max_boost_cents ?? boostLimits.maxBoostGlobalCents),
    );
    setMinBoost((minBoostCents / 100).toFixed(2));
    setMaxBoost((Math.max(minBoostCents, maxBoostCents) / 100).toFixed(2));
    setMaxDurationMin(String(Math.max(1, Math.round((data.max_duration_sec ?? 600) / 60))));
    setAllowYoutube(!!data.allow_youtube);
    setAllowSpotify(!!data.allow_spotify);
    setAllowSoundcloud(!!data.allow_soundcloud);
    setAllowUpload(!!data.allow_upload);
    setRequirePayment(!!data.require_payment);
    setOpen(true);
  }

  function onPickCover(f: File | null) {
    if (!f) {
      setCoverFile(null);
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      setCoverPreview(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Apenas imagens (JPG, PNG, WEBP)");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Capa máxima: 2 MB");
      return;
    }
    setCoverFile(f);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(URL.createObjectURL(f));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const cents = Math.round(parseFloat(minBoost.replace(",", ".")) * 100);
    const maxCents = Math.round(parseFloat(maxBoost.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      toast.error("Preço mínimo inválido");
      return;
    }
    if (cents < boostLimits.minBoostGlobalCents) {
      toast.error(
        `Fura fila mínimo da plataforma: ${formatCents(boostLimits.minBoostGlobalCents)}`,
      );
      return;
    }
    if (cents > boostLimits.maxBoostGlobalCents) {
      toast.error(
        `Fura fila mínimo não pode passar de ${formatCents(boostLimits.maxBoostGlobalCents)}`,
      );
      return;
    }
    if (!Number.isFinite(maxCents) || maxCents < cents) {
      toast.error("Preço máximo deve ser maior que o mínimo");
      return;
    }
    if (maxCents > boostLimits.maxBoostGlobalCents) {
      toast.error(
        `Fura fila máximo da plataforma: ${formatCents(boostLimits.maxBoostGlobalCents)}`,
      );
      return;
    }
    const maxDurMin = parseInt(maxDurationMin, 10);
    if (!Number.isFinite(maxDurMin) || maxDurMin < 1 || maxDurMin > 120) {
      toast.error("Duração máxima entre 1 e 120 minutos");
      return;
    }
    const maxDurSec = maxDurMin * 60;

    setCreating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada");

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        min_boost_cents: cents,
        max_boost_cents: maxCents,
        allow_youtube: allowYoutube,
        allow_spotify: allowSpotify,
        allow_soundcloud: allowSoundcloud,
        allow_upload: allowUpload,
        require_payment: requirePayment,
        max_duration_sec: maxDurSec,
      };

      let roomId: string;
      let roomSlug: string;

      if (editId) {
        const { data, error } = await supabase
          .from("rooms")
          .update(payload)
          .eq("id", editId)
          .select("id, slug")
          .single();
        if (error) throw error;
        roomId = data.id;
        roomSlug = data.slug;
      } else {
        const base = slugify(name) || "sala";
        let slug = base;
        for (let i = 0; i < 3; i++) {
          const { data: existing } = await supabase
            .from("rooms")
            .select("id")
            .eq("slug", slug)
            .maybeSingle();
          if (!existing) break;
          slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
        }
        const { data, error } = await supabase
          .from("rooms")
          .insert({ ...payload, slug, owner_id: userData.user.id })
          .select("id, slug")
          .single();
        if (error) throw error;
        roomId = data.id;
        roomSlug = data.slug;
      }

      // Upload cover (after upsert so we have roomId for the storage path)
      if (coverFile) {
        const ext = (coverFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `covers/${roomId}/cover-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("song-uploads")
          .upload(path, coverFile, { contentType: coverFile.type, upsert: true });
        if (upErr) {
          toast.error("Salvo, mas a capa falhou: " + upErr.message);
        } else {
          await supabase.from("rooms").update({ cover_url: path }).eq("id", roomId);
        }
      }

      toast.success(editId ? "Sala atualizada!" : "Sala criada!");
      const wasEdit = !!editId;
      setOpen(false);
      resetForm();
      if (wasEdit) {
        load();
      } else {
        navigate({ to: "/rooms/$slug", params: { slug: roomSlug } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const { error } = await supabase
      .from("rooms")
      .update({ archived_at: new Date().toISOString(), is_open: false })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sala arquivada");
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const gradients = [
    "from-fuchsia-500/40 to-indigo-500/20",
    "from-emerald-500/40 to-cyan-500/20",
    "from-amber-500/40 to-rose-500/20",
    "from-violet-500/40 to-sky-500/20",
    "from-rose-500/40 to-orange-500/20",
    "from-teal-500/40 to-lime-500/20",
  ];

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
        {/* MOBILE TOP BAR */}
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

        {/* MOBILE NAV BACKDROP */}
        {navOpen && (
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm md:hidden"
            aria-label="Fechar menu"
          />
        )}

        {/* SIDEBAR */}
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
            <Link
              to="/dashboard"
              className="flex items-center gap-3 border-l-2 border-neon bg-surface px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-foreground"
            >
              <Home className="h-4 w-4" /> Início
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="flex w-full items-center gap-3 border-l-2 border-transparent px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Nova
            </button>
            <Link
              to="/withdrawals"
              className="flex items-center gap-3 border-l-2 border-transparent px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-surface hover:text-foreground"
            >
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

        {/* MAIN */}
        <main className="min-w-0 flex-1">
          <div className="w-full px-4 py-6 sm:px-8 sm:py-8">
            {/* Console header */}
            <header className="flex flex-col gap-4 border-b border-border pb-6 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0 space-y-1">
                <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                  Painel · Studio
                </span>
                <h1 className="font-display text-2xl font-bold italic uppercase leading-none tracking-tighter sm:text-5xl">
                  Boa, vamo <span className="text-neon">subir o som</span>
                </h1>
                <p className="max-w-xl pt-2 text-sm text-muted-foreground">
                  Cada playlist é uma sala ao vivo. Compartilha o link, recebe música e deixa o chat
                  pagar pra furar a fila.
                </p>
              </div>
              <div className="flex shrink-0 flex-row items-center justify-between gap-2 sm:flex-col sm:items-end">
                <div className="flex items-center gap-2 border border-neon/40 bg-neon/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-neon">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon shadow-[0_0_8px_var(--neon)]" />
                  Studio Online
                </div>
                <button
                  onClick={() => setOpen(true)}
                  className="hidden items-center gap-2 border border-neon bg-neon px-4 py-2 font-display text-[11px] font-bold uppercase tracking-widest text-neon-foreground hover:opacity-90 sm:inline-flex"
                >
                  <Plus className="h-4 w-4" /> Nova playlist
                </button>
              </div>
            </header>

            {/* Stats strip */}
            {(() => {
              const availableFmt = (availableCents / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              });
              return (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="border border-border bg-surface/60 p-4 backdrop-blur-[1px]">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Music2 className="h-3 w-3" /> Playlists
                    </div>
                    <div className="mt-2 font-display text-3xl font-bold tabular-nums leading-none tracking-tighter">
                      {rooms.length.toString().padStart(2, "0")}
                    </div>
                  </div>
                  <div className="border border-border bg-surface/60 p-4 backdrop-blur-[1px]">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Radio className="h-3 w-3" /> Ao Vivo
                    </div>
                    <div className="mt-2 font-display text-3xl font-bold tabular-nums leading-none tracking-tighter text-neon">
                      {rooms
                        .filter((r) => r.is_open)
                        .length.toString()
                        .padStart(2, "0")}
                    </div>
                  </div>
                  <Link
                    to="/withdrawals"
                    className="col-span-2 bg-neon p-4 text-neon-foreground transition hover:opacity-90 sm:col-span-2"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-neon-foreground/80">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="h-3 w-3" /> Disponível para saque
                      </span>
                      <span className="opacity-70">ver saques →</span>
                    </div>
                    <div className="mt-2 font-display text-3xl font-bold italic uppercase tabular-nums leading-none tracking-tighter text-neon-foreground">
                      {availableFmt}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-neon-foreground/70">
                      Já desconta saques pendentes, aprovados e pagos
                    </div>
                  </Link>
                </div>
              );
            })()}

            {/* Mobile full-width create button */}
            <button
              onClick={() => setOpen(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 border border-neon bg-neon py-2.5 font-display text-[11px] font-bold uppercase tracking-widest text-neon-foreground hover:opacity-90 sm:hidden"
            >
              <Plus className="h-4 w-4" /> Criar nova playlist
            </button>

            {/* Rooms list */}
            <section className="mt-6 pb-16 sm:mt-10">
              <div className="mb-3 flex items-end justify-between border-b border-border pb-2">
                <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Suas Estações
                </h2>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {rooms.length.toString().padStart(2, "0")} REGISTRADAS
                </span>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-20 animate-pulse border border-border bg-surface/40"
                    />
                  ))}
                </div>
              ) : rooms.length === 0 ? (
                <div className="border border-dashed border-border bg-black/40 p-12 text-center">
                  <Radio className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-display font-bold uppercase tracking-widest">
                    Nenhuma estação ativa
                  </p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Crie a primeira pra começar a captar pedidos
                  </p>
                  <button
                    onClick={() => setOpen(true)}
                    className="mt-4 inline-flex items-center gap-1 border border-neon bg-neon px-4 py-2 font-display text-[11px] font-bold uppercase tracking-widest text-neon-foreground hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" /> Criar playlist
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {rooms.map((r, i) => (
                    <div
                      key={r.id}
                      className="group relative flex w-full items-center gap-4 border border-border bg-surface/60 p-3 backdrop-blur-[1px] transition hover:border-neon/40 hover:bg-surface"
                    >
                      <Link
                        to="/rooms/$slug"
                        params={{ slug: r.slug }}
                        className="flex min-w-0 flex-1 items-center gap-4"
                      >
                        <div
                          className={`relative h-16 w-16 shrink-0 overflow-hidden border border-border bg-gradient-to-br sm:h-20 sm:w-20 ${gradients[i % gradients.length]}`}
                        >
                          <RoomCover path={r.cover_url} name={r.name} />
                          <span className="absolute left-1 top-1 z-10 font-mono text-[9px] font-bold uppercase text-foreground/70 mix-blend-difference">
                            #{(i + 1).toString().padStart(2, "0")}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate font-display text-lg font-bold tracking-tight">
                              {r.name}
                            </div>
                            {r.is_open && (
                              <span className="inline-flex items-center gap-1 border border-neon/40 bg-neon/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-neon">
                                <span className="h-1 w-1 animate-pulse rounded-full bg-neon" />
                                ao vivo
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            songpix.app/{r.slug}
                          </div>
                        </div>
                        <ArrowUpRight className="hidden h-5 w-5 shrink-0 text-muted-foreground transition group-hover:text-neon md:block" />
                      </Link>
                      <div className="flex shrink-0 items-center gap-1 pl-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/${r.slug}`);
                            toast.success("Link copiado");
                          }}
                          className="inline-flex items-center gap-1 border border-border px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-neon hover:text-neon"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">link</span>
                        </button>
                        <button
                          onClick={() => openEdit(r.id)}
                          className="border border-border p-2 text-muted-foreground hover:border-neon hover:text-neon"
                          aria-label="Editar sala"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="border border-border p-2 text-muted-foreground hover:border-destructive hover:text-destructive"
                          aria-label="Remover sala"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      <Dialog
        open={welcomeOpen}
        onOpenChange={(v) => {
          if (!v) closeWelcome();
          else setWelcomeOpen(true);
        }}
      >
        <DialogContent className="bg-surface border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold italic uppercase tracking-tighter">
              Bem-vindo ao SongPIX
            </DialogTitle>
            <DialogDescription>
              Monte uma sala para sua live, compartilhe o link com o público e receba pedidos de
              música com fura fila para destacar no Top.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {[
              { icon: Plus, text: "Crie uma sala com capa, fontes aceitas e valor de fura fila." },
              { icon: Share2, text: "Envie o link público para o chat pedir músicas." },
              { icon: Zap, text: "Use Fura Fila e Top para organizar os pedidos mais importantes." },
              { icon: Wallet, text: "Acompanhe ganhos e solicite saques quando atingir o mínimo." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="flex gap-3 border border-border bg-background/40 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center bg-neon text-neon-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            {!loading && rooms.length === 0 && (
              <button
                type="button"
                onClick={createFirstRoomFromWelcome}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-neon bg-neon px-4 py-2 text-sm font-semibold text-neon-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Criar primeira sala
              </button>
            )}
            <button
              type="button"
              onClick={closeWelcome}
              className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Começar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="bg-surface border-border sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold italic uppercase tracking-tighter">
              {editId ? "Editar playlist" : "Nova playlist"}
            </DialogTitle>
            <DialogDescription>
              {editId
                ? "Atualize nome, capa, descrição, preços de fura fila e fontes aceitas."
                : "Configure o nome, capa, descrição, preço do fura fila e as fontes aceitas."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 border border-neon/30 bg-neon/[0.06] p-3 sm:grid-cols-3">
            {[
              ["01", "Identidade", "Nome, capa e descrição da sala."],
              ["02", "Monetização", "Valores e modo pago obrigatório."],
              ["03", "Fontes", "Links e upload aceitos pelo público."],
            ].map(([n, title, desc]) => (
              <div key={n} className="border border-border/70 bg-background/50 p-3">
                <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-neon">
                  etapa {n}
                </div>
                <div className="mt-1 font-display text-xs font-bold uppercase tracking-widest">
                  {title}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {desc}
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={handleCreate} className="space-y-5">
            {/* 📝 Informações Básicas */}
            <fieldset className="space-y-4 border border-border bg-background/40 p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                📝 Informações básicas
              </legend>

              <div className="grid gap-4 sm:grid-cols-[104px_minmax(0,1fr)]">
                <label className="group relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden border border-dashed border-border bg-surface-2 hover:border-neon">
                  {coverPreview ? (
                    <>
                      <img src={coverPreview} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onPickCover(null);
                        }}
                        className="absolute right-0 top-0 grid h-5 w-5 place-items-center bg-background/80 text-foreground hover:text-destructive"
                        aria-label="Remover capa"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : existingCoverPath ? (
                    <ExistingCoverThumb path={existingCoverPath} />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-neon">
                      <ImagePlus className="h-5 w-5" />
                      <span className="font-mono text-[8px] uppercase tracking-widest">Capa</span>
                      <span className="font-mono text-[7px] uppercase tracking-widest opacity-70">
                        opcional
                      </span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => onPickCover(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
                <div className="flex-1 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Nome da sala
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={60}
                      placeholder="Ex: Live de quinta"
                      className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Descrição <span className="text-muted-foreground/60">(opcional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={240}
                  rows={2}
                  placeholder="Conta pro chat o vibe da sala…"
                  className="w-full resize-none rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
                />
                <div className="mt-1 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                  {description.length}/240
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3 border border-border bg-background/40 p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                ⚡ Fura fila
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Mínimo (R$)
                  </label>
                  <input
                    type="number"
                    min={boostLimits.minBoostGlobalCents / 100}
                    max={boostLimits.maxBoostGlobalCents / 100}
                    step="0.50"
                    value={minBoost}
                    onChange={(e) => setMinBoost(e.target.value)}
                    className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Máximo (R$)
                  </label>
                  <input
                    type="number"
                    min={boostLimits.minBoostGlobalCents / 100}
                    max={boostLimits.maxBoostGlobalCents / 100}
                    step="1"
                    value={maxBoost}
                    onChange={(e) => setMaxBoost(e.target.value)}
                    className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Valores aceitos entre {formatCents(boostLimits.minBoostGlobalCents)} e{" "}
                {formatCents(boostLimits.maxBoostGlobalCents)}.
              </p>
            </fieldset>

            <fieldset className="space-y-3 border border-neon/30 bg-neon/[0.05] p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-neon">
                🔒 Modo de entrada
              </legend>
              <button
                type="button"
                onClick={() => setRequirePayment((v) => !v)}
                className={`flex w-full items-start gap-3 border p-3 text-left transition ${
                  requirePayment
                    ? "border-neon bg-neon text-neon-foreground"
                    : "border-border bg-background/50 text-foreground hover:border-neon/60"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border text-[10px] font-black ${
                    requirePayment
                      ? "border-neon-foreground bg-neon-foreground text-neon"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {requirePayment ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-sm font-bold uppercase tracking-widest">
                    Apenas músicas pagas entram na fila
                  </span>
                  <span
                    className={`mt-1 block text-xs leading-relaxed ${
                      requirePayment ? "text-neon-foreground/75" : "text-muted-foreground"
                    }`}
                  >
                    Quando ativo, o público precisa pagar o fura fila mínimo para enviar uma música.
                    Pedidos grátis ficam bloqueados.
                  </span>
                </span>
              </button>
            </fieldset>

            <fieldset className="space-y-2 border border-border bg-background/40 p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                ⏱ Duração máxima por música
              </legend>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="120"
                  step="1"
                  value={maxDurationMin}
                  onChange={(e) => setMaxDurationMin(e.target.value)}
                  className="w-24 rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Músicas maiores que isso serão recusadas no envio (1–120 min).
              </p>
            </fieldset>

            <fieldset className="space-y-2 border border-border bg-background/40 p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                🎧 Fontes aceitas
              </legend>
              {[
                { label: "YouTube", val: allowYoutube, set: setAllowYoutube },
                { label: "Spotify", val: allowSpotify, set: setAllowSpotify },
                { label: "SoundCloud", val: allowSoundcloud, set: setAllowSoundcloud },
                { label: "Upload de arquivo (MP3/WAV)", val: allowUpload, set: setAllowUpload },
              ].map((s) => (
                <label key={s.label} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.val}
                    onChange={(e) => s.set(e.target.checked)}
                    className="h-4 w-4 accent-neon"
                  />
                  {s.label}
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !name.trim()}
                className="inline-flex items-center justify-center gap-1 rounded-md bg-neon px-4 py-2 text-sm font-semibold text-neon-foreground hover:opacity-90 disabled:opacity-50"
              >
                {editId ? (
                  <>
                    <Pencil className="h-4 w-4" /> Salvar
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Criar
                  </>
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent className="bg-surface border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              A sala sairá do painel e do link público, mas vendas e histórico financeiro serão
              preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoomCover({ path, name }: { path: string | null; name: string }) {
  const url = useCoverUrl(path);
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <div className="absolute inset-0 grid place-items-center">
      <ListMusic className="h-7 w-7 text-foreground/80" />
    </div>
  );
}

function ExistingCoverThumb({ path }: { path: string }) {
  const url = useCoverUrl(path);
  if (!url) {
    return (
      <div className="flex flex-col items-center gap-1 text-muted-foreground">
        <ImagePlus className="h-5 w-5" />
        <span className="font-mono text-[8px] uppercase tracking-widest">trocar</span>
      </div>
    );
  }
  return (
    <>
      <img src={url} alt="" className="h-full w-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 bg-background/70 py-0.5 text-center font-mono text-[8px] uppercase tracking-widest text-foreground">
        trocar
      </span>
    </>
  );
}
