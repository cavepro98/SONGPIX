import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ListMusic,
  Plus,
  Trash2,
  Radio,
  Share2,
  Music2,
  ArrowUpRight,
  ImagePlus,
  X,
  Wallet,
  Pencil,
  MessageCircle,
  Zap,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
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
  head: () => ({ meta: [{ title: "Meu SongPIX | SongPIX" }] }),
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
const DEFAULT_BOOST_LIMITS = {
  minBoostGlobalCents: 100,
  maxBoostGlobalCents: 1_000_000,
};
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "overlay",
  "rooms",
  "saques",
  "spotify",
  "withdrawals",
]);

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizePublicSlug(s: string) {
  return slugify(s.replace(/^@+/, ""));
}

function formatCents(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Dashboard() {
  const navigate = useNavigate();
  const fetchEarnings = useServerFn(getMyEarnings);
  const fetchBoostLimits = useServerFn(getBoostPriceLimits);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [musicCount, setMusicCount] = useState(0);
  const [availableCents, setAvailableCents] = useState(0);
  const [boostLimits, setBoostLimits] = useState(DEFAULT_BOOST_LIMITS);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [existingCoverPath, setExistingCoverPath] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [publicSlug, setPublicSlug] = useState("");
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
      setMusicCount(0);
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
    if (error) {
      toast.error(error.message);
      setMusicCount(0);
    } else {
      const nextRooms = (data ?? []) as Room[];
      setRooms(nextRooms);
      const primaryRoomId = nextRooms[0]?.id;
      if (primaryRoomId) {
        const { count, error: countError } = await supabase
          .from("queue_items")
          .select("id", { count: "exact", head: true })
          .eq("room_id", primaryRoomId);
        if (countError) toast.error(countError.message);
        setMusicCount(count ?? 0);
      } else {
        setMusicCount(0);
      }
    }
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
    openMainConfig();
  }

  function resetForm() {
    setName("");
    setPublicSlug("");
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

  function openMainConfig() {
    const primary = rooms[0];
    if (primary) {
      openEdit(primary.id);
      return;
    }
    resetForm();
    setOpen(true);
  }

  async function openEdit(roomId: string) {
    const { data, error } = await supabase
      .from("rooms")
      .select(
        "id, slug, name, description, cover_url, min_boost_cents, max_boost_cents, max_duration_sec, allow_youtube, allow_spotify, allow_soundcloud, allow_upload, require_payment",
      )
      .eq("id", roomId)
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message ?? "Sala não encontrada");
      return;
    }
    setEditId(data.id);
    setName(data.name ?? "");
    setPublicSlug(data.slug ?? "");
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
    const slug = normalizePublicSlug(publicSlug || name);
    if (!slug || slug.length < 3) {
      toast.error("Defina um link público com pelo menos 3 caracteres");
      return;
    }
    if (RESERVED_SLUGS.has(slug)) {
      toast.error("Esse link é reservado pelo SongPIX");
      return;
    }
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
        slug,
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
      const targetEditId = editId || rooms[0]?.id || null;

      const { data: existingSlug, error: slugError } = await supabase
        .from("rooms")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (slugError) throw slugError;
      if (existingSlug && existingSlug.id !== targetEditId) {
        throw new Error("Esse link público já está em uso");
      }

      if (targetEditId) {
        const { data, error } = await supabase
          .from("rooms")
          .update(payload)
          .eq("id", targetEditId)
          .select("id, slug")
          .single();
        if (error) throw error;
        roomId = data.id;
        roomSlug = data.slug;
      } else {
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

      toast.success(targetEditId ? "SongPIX atualizado!" : "SongPIX configurado!");
      const wasEdit = !!targetEditId;
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
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sala excluída");
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setMusicCount(0);
  }

  const gradients = [
    "from-fuchsia-500/40 to-indigo-500/20",
    "from-emerald-500/40 to-cyan-500/20",
    "from-amber-500/40 to-rose-500/20",
    "from-violet-500/40 to-sky-500/20",
    "from-rose-500/40 to-orange-500/20",
    "from-teal-500/40 to-lime-500/20",
  ];
  const primaryRoom = rooms[0] ?? null;
  const platformHost = typeof window !== "undefined" ? window.location.host : "songpix.app";
  const publicSlugPreview = normalizePublicSlug(publicSlug || name);
  const publicLinkPreview = publicSlugPreview
    ? `${platformHost}/${publicSlugPreview}`
    : `${platformHost}/seu-link`;

  return (
    <>
      <AppShell
        active="dashboard"
        roomSlug={primaryRoom?.slug}
        contextLabel={primaryRoom?.name}
        roomOpen={primaryRoom?.is_open}
      >
        {/* Page header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Painel principal</p>
            <h1 className="page-title mt-1">Visão geral</h1>
            <p className="page-description mt-1 max-w-2xl">
              Seu SongPIX é um link único para receber pedidos, doações e fura fila durante a live.
              Configure uma vez e compartilhe com o chat.
            </p>
          </div>
          <button
            onClick={openMainConfig}
            className="app-focus inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-neon px-4 text-sm font-semibold text-neon-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Configurar meu SongPIX
          </button>
        </header>

        {/* Stats strip */}
        {(() => {
          const availableFmt = (availableCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
          return (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="app-panel p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Músicas recebidas</p>
                    <div className="mt-4 text-3xl font-bold tabular-nums tracking-tight">
                      {musicCount.toString().padStart(2, "0")}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Total do seu SongPIX</p>
                  </div>
                  <div className="grid h-11 w-11 place-items-center rounded-xl border border-neon/20 bg-neon/10 text-neon">
                    <Music2 className="h-5 w-5" />
                  </div>
                </div>
              </div>
              <Link
                to="/withdrawals"
                className="app-panel group p-5 transition hover:border-neon/40"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Disponível para saque</p>
                    <div className="mt-4 text-3xl font-bold tabular-nums tracking-tight text-neon">
                      {availableFmt}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Consulte seu saldo e histórico de saques
                    </p>
                  </div>
                  <div className="grid h-11 w-11 place-items-center rounded-xl border border-neon/20 bg-neon/10 text-neon transition group-hover:bg-neon group-hover:text-neon-foreground">
                    <Wallet className="h-5 w-5" />
                  </div>
                </div>
              </Link>
            </div>
          );
        })()}

        {/* Main room */}
        <section className="mt-6 pb-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="section-title">Meu SongPIX</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Sua sala e link público</p>
            </div>
          </div>

          {loading ? (
            <div className="app-panel space-y-3 p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-neon text-neon-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Buscando seu SongPIX</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">sincronizando seu SongPIX</p>
                </div>
              </div>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-background/60" />
              ))}
            </div>
          ) : !primaryRoom ? (
            <div className="app-panel border-dashed p-7 text-center sm:p-9">
              <Radio className="mx-auto h-8 w-8 text-neon" />
              <p className="mt-3 text-lg font-semibold">Configure seu link principal</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Defina seu link, capa, fontes aceitas e valores. Esse será o endereço único para o
                público pedir músicas na sua live.
              </p>
              <button
                onClick={openMainConfig}
                className="app-focus mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-neon px-4 text-sm font-semibold text-neon-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Configurar meu SongPIX
              </button>
            </div>
          ) : (
            <div className="app-panel group relative overflow-hidden p-4 transition hover:border-neon/40 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  to="/rooms/$slug"
                  params={{ slug: primaryRoom.slug }}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  <div
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-gradient-to-br sm:h-20 sm:w-20 ${gradients[0]}`}
                  >
                    <RoomCover path={primaryRoom.cover_url} name={primaryRoom.name} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-xl font-semibold tracking-tight">
                        {primaryRoom.name}
                      </div>
                      {primaryRoom.is_open && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-[10px] font-semibold text-neon">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-neon" />
                          ao vivo
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-xs font-medium text-neon">
                      songpix.app/{primaryRoom.slug}
                    </div>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                      Esse é o link para seu público enviar músicas e apoios durante a live.
                    </p>
                  </div>
                  <ArrowUpRight className="hidden h-5 w-5 shrink-0 text-muted-foreground transition group-hover:text-neon md:block" />
                </Link>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/${primaryRoom.slug}`,
                      );
                      toast.success("Link copiado");
                    }}
                    className="app-focus inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:border-neon/50 hover:text-foreground"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    link
                  </button>
                  <button
                    onClick={() => openEdit(primaryRoom.id)}
                    className="app-focus inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:border-neon/50 hover:text-foreground"
                    aria-label="Editar sala"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    editar
                  </button>
                  <Link
                    to="/rooms/$slug"
                    params={{ slug: primaryRoom.slug }}
                    className="app-focus col-span-2 inline-flex min-h-10 items-center justify-center rounded-lg bg-neon px-3 text-xs font-semibold text-neon-foreground hover:opacity-90 sm:col-span-1"
                  >
                    abrir painel
                  </Link>
                  <button
                    onClick={() => setDeleteId(primaryRoom.id)}
                    className="app-focus col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:border-destructive/60 hover:text-destructive sm:col-span-1"
                    aria-label="Remover sala"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    excluir
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </AppShell>

      <Dialog
        open={welcomeOpen}
        onOpenChange={(v) => {
          if (!v) closeWelcome();
          else setWelcomeOpen(true);
        }}
      >
        <DialogContent className="bg-surface border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Bem-vindo ao SongPIX
            </DialogTitle>
            <DialogDescription>
              Configure seu link principal, compartilhe com o público e receba pedidos de música com
              apoio e fura fila durante a live.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {[
              { icon: Plus, text: "Crie uma sala com capa, fontes aceitas e valor de fura fila." },
              { icon: Share2, text: "Defina seu link público e envie para o chat." },
              {
                icon: Zap,
                text: "Use Fura Fila e Top para organizar os pedidos mais importantes.",
              },
              { icon: Wallet, text: "Acompanhe ganhos e solicite saques quando atingir o mínimo." },
              {
                icon: MessageCircle,
                text: "Mande dúvidas, dicas e sugestões pelo suporte WhatsApp.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.text}
                  className="flex gap-3 rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neon text-neon-foreground">
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
                <Plus className="h-4 w-4" /> Configurar meu SongPIX
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
        <DialogContent className="max-h-[92vh] overflow-y-auto bg-surface border-border sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Configurar meu SongPIX
            </DialogTitle>
            <DialogDescription>
              Defina seu link público, identidade, valores e regras para receber pedidos na live.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-xl border border-neon/30 bg-neon/[0.06] p-3 sm:grid-cols-3">
            {[
              ["01", "Link", "Endereço público e identidade da sala."],
              ["02", "Monetização", "Valores e modo pago obrigatório."],
              ["03", "Fontes", "Links e upload aceitos pelo público."],
            ].map(([n, title, desc]) => (
              <div key={n} className="rounded-lg border border-border/70 bg-background/50 p-3">
                <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-neon">
                  etapa {n}
                </div>
                <div className="mt-1 font-display text-xs font-bold uppercase tracking-widest">
                  {title}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{desc}</div>
              </div>
            ))}
          </div>
          <form onSubmit={handleCreate} className="space-y-5">
            <fieldset className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Identidade e link público
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
                      Nome do seu SongPIX
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={60}
                      placeholder="Ex: Live do Mateus"
                      className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neon"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Link público
                    </label>
                    <div className="flex overflow-hidden rounded-md border border-input bg-surface-2 focus-within:ring-2 focus-within:ring-neon">
                      <span className="shrink-0 border-r border-border bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                        {platformHost}/
                      </span>
                      <input
                        type="text"
                        value={publicSlug}
                        onChange={(e) => setPublicSlug(e.target.value.replace(/^@+/, ""))}
                        maxLength={48}
                        placeholder="mateuslive"
                        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] font-bold uppercase tracking-widest text-neon">
                      {publicLinkPreview}
                    </div>
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

            <fieldset className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Fura fila
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
                    step="0.01"
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
                    step="0.01"
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

            <fieldset className="space-y-3 rounded-xl border border-neon/30 bg-neon/[0.05] p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-neon">
                Modo de entrada
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

            <fieldset className="space-y-2 rounded-xl border border-border bg-background/40 p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Duração máxima por música
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

            <fieldset className="space-y-2 rounded-xl border border-border bg-background/40 p-4">
              <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Fontes aceitas
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
                {editId || primaryRoom ? (
                  <>
                    <Pencil className="h-4 w-4" /> Salvar
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Configurar
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
            <AlertDialogTitle>Excluir meu SongPIX?</AlertDialogTitle>
            <AlertDialogDescription>
              A sala e as músicas serão apagadas. As vendas e o histórico financeiro continuarão
              preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
