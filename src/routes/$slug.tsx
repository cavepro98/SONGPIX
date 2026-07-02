import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  createUploadTicket,
  submitTrack,
  submitUploadedTrackFromStorage,
} from "@/lib/queue.functions";
import PixCheckoutModal from "@/components/PixCheckoutModal";
import { toast } from "sonner";
import { ListMusic, Zap, Plus, Star, Upload, Loader2 } from "lucide-react";
import { SourceBadge } from "@/components/SourceBadge";
import { Marquee } from "@/components/Marquee";
import bgNoise from "@/assets/bg-noise.gif";
import { useCoverUrl } from "@/lib/use-cover-url";
import { useAnimatedSwap } from "@/hooks/use-animated-swap";

export const Route = createFileRoute("/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Fila ao vivo | ${params.slug} · SongPIX` },
      {
        name: "description",
        content: "Mande sua música pra fila dessa live. Quem paga mais sobe.",
      },
    ],
  }),
  component: ViewerRoom,
});

type Room = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_open: boolean;
  min_boost_cents: number;
  max_boost_cents: number;
  allow_upload: boolean;
  require_payment: boolean;
};

type BoostLimits = {
  minBoostGlobalCents: number;
  maxBoostGlobalCents: number;
};

type QueueItem = {
  id: string;
  title: string;
  artist: string | null;
  thumbnail_url: string | null;
  source: string;
  submitter_name: string;
  paid_amount_cents: number;
  status: string;
  created_at: string;
  is_top: boolean;
  manual_order: number | null;
  played_at?: string | null;
};

function sortQueue(items: QueueItem[]) {
  return [...items].sort((a, b) => {
    if (a.is_top !== b.is_top) return a.is_top ? -1 : 1;
    const am = a.manual_order,
      bm = b.manual_order;
    if (am !== null && bm !== null && am !== bm) return am - bm;
    if (am !== null && bm === null) return -1;
    if (am === null && bm !== null) return 1;
    if (b.paid_amount_cents !== a.paid_amount_cents)
      return b.paid_amount_cents - a.paid_amount_cents;
    return a.created_at.localeCompare(b.created_at);
  });
}

function formatCents(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatInputCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function parseCurrencyCents(value: string) {
  const clean = value.replace(/[^\d,.]/g, "").trim();
  if (!clean) return 0;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

const DEFAULT_BOOST_LIMITS: BoostLimits = {
  minBoostGlobalCents: 100,
  maxBoostGlobalCents: 1_000_000,
};

function normalizeRoomBoostLimits(room: Room | null, limits: BoostLimits) {
  if (!room) return room;
  const minBoostCents = Math.max(room.min_boost_cents, limits.minBoostGlobalCents);
  const maxBoostCents = Math.min(
    Math.max(room.max_boost_cents || limits.maxBoostGlobalCents, minBoostCents),
    limits.maxBoostGlobalCents,
  );
  return {
    ...room,
    min_boost_cents: minBoostCents,
    max_boost_cents: Math.max(minBoostCents, maxBoostCents),
  };
}

function normalizeUserHandle(value: string) {
  const clean = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase()
    .slice(0, 29);

  return clean ? `@${clean}` : "";
}

function ViewerRoom() {
  const { slug } = Route.useParams();
  const submit = useServerFn(submitTrack);
  const createUpload = useServerFn(createUploadTicket);
  const submitStorageUpload = useServerFn(submitUploadedTrackFromStorage);
  const [pixOpen, setPixOpen] = useState(false);
  const [pixTarget, setPixTarget] = useState<{
    itemId?: string;
    amountCents: number;
    song?: {
      url: string;
      title: string;
      artist?: string;
      thumbnailUrl?: string;
      source?: "youtube" | "spotify" | "soundcloud" | "upload";
    };
  } | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [boostLimits, setBoostLimits] = useState<BoostLimits>(DEFAULT_BOOST_LIMITS);
  const coverUrl = useCoverUrl(room?.cover_url ?? null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [boostOpen, setBoostOpen] = useState<string | null>(null);
  const [boostAmount, setBoostAmount] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [file, setFile] = useState<File | null>(null);
  const [trackTitle, setTrackTitle] = useState("");
  const [tab, setTab] = useState<"queue" | "top" | "history">("queue");
  const [history, setHistory] = useState<QueueItem[]>([]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("songpix_name") : "";
    if (saved) setName(saved);
  }, []);

  useEffect(() => {
    if (room?.require_payment) {
      setRequestAmount((current) => current || formatInputCents(room.min_boost_cents));
    }
  }, [room?.id, room?.require_payment, room?.min_boost_cents]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [roomResult, limits] = await Promise.all([
        supabase
          .from("rooms")
          .select(
            "id, slug, name, description, cover_url, is_open, min_boost_cents, max_boost_cents, allow_upload, require_payment",
          )
          .eq("slug", slug)
          .is("archived_at", null)
          .maybeSingle(),
        fetch("/api/public/app-config")
          .then((r) => (r.ok ? r.json() : null))
          .then((config) => {
            const minBoostGlobalCents = Number(
              config?.minBoostGlobalCents ?? DEFAULT_BOOST_LIMITS.minBoostGlobalCents,
            );
            const maxBoostGlobalCents = Number(
              config?.maxBoostGlobalCents ?? DEFAULT_BOOST_LIMITS.maxBoostGlobalCents,
            );
            return {
              minBoostGlobalCents,
              maxBoostGlobalCents: Math.max(minBoostGlobalCents, maxBoostGlobalCents),
            };
          })
          .catch(() => DEFAULT_BOOST_LIMITS),
      ]);
      if (!mounted) return;
      setBoostLimits(limits);
      const roomWithLimits = normalizeRoomBoostLimits((roomResult.data as Room | null) ?? null, limits);
      setRoom(roomWithLimits);
      if (roomWithLimits) {
        const { data: q } = await supabase
          .from("queue_items")
          .select("*")
          .eq("room_id", roomWithLimits.id)
          .in("status", ["queued", "playing"]);
        if (!mounted) return;
        setItems(sortQueue((q ?? []) as QueueItem[]));
        const { data: h } = await supabase
          .from("queue_items")
          .select("*")
          .eq("room_id", roomWithLimits.id)
          .in("status", ["played", "skipped"])
          .order("played_at", { ascending: false })
          .limit(50);
        if (!mounted) return;
        setHistory((h ?? []) as QueueItem[]);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!room) return;
    const roomId = room.id;
    async function refetch() {
      const { data: q } = await supabase
        .from("queue_items")
        .select("*")
        .eq("room_id", roomId)
        .in("status", ["queued", "playing"]);
      setItems(sortQueue((q ?? []) as QueueItem[]));
      const { data: h } = await supabase
        .from("queue_items")
        .select("*")
        .eq("room_id", roomId)
        .in("status", ["played", "skipped"])
        .order("played_at", { ascending: false })
        .limit(50);
      setHistory((h ?? []) as QueueItem[]);
    }
    const channel = supabase
      .channel(`viewer-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setRoom(null);
            return;
          }
          setRoom((r) =>
            normalizeRoomBoostLimits(
              r ? { ...r, ...(payload.new as Room) } : (payload.new as Room),
              boostLimits,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_items", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const next = payload.new as QueueItem;
            if (next.status === "played" || next.status === "skipped") {
              setHistory((h) => [next, ...h.filter((i) => i.id !== next.id)].slice(0, 50));
            }
          }
          setItems((prev) => {
            if (payload.eventType === "INSERT") {
              return sortQueue(
                [...prev, payload.new as QueueItem].filter((i) =>
                  ["queued", "playing"].includes(i.status),
                ),
              );
            }
            if (payload.eventType === "UPDATE") {
              return sortQueue(
                prev
                  .map((i) =>
                    i.id === (payload.new as QueueItem).id ? (payload.new as QueueItem) : i,
                  )
                  .filter((i) => ["queued", "playing"].includes(i.status)),
              );
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((i) => i.id !== (payload.old as QueueItem).id);
            }
            return prev;
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refetch();
      });

    function onVisible() {
      if (document.visibilityState === "visible") refetch();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [room]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;
    const cleanName = normalizeUserHandle(name);
    if (!cleanName) return toast.error("Informe seu @ de usuário");
    setName(cleanName);
    setSubmitting(true);
    try {
      const paidRequestCents = room.require_payment ? parseCurrencyCents(requestAmount) : 0;
      if (room.require_payment) {
        if (!paidRequestCents || paidRequestCents <= 0) throw new Error("Informe o valor do apoio");
        if (paidRequestCents < room.min_boost_cents) {
          throw new Error(`Mínimo: ${formatCents(room.min_boost_cents)}`);
        }
        if (room.max_boost_cents && paidRequestCents > room.max_boost_cents) {
          throw new Error(`Máximo: ${formatCents(room.max_boost_cents)}`);
        }
      }
      if (mode === "upload") {
        if (!file) throw new Error("Selecione um arquivo de áudio");
        if (!trackTitle.trim()) throw new Error("Coloque o nome da música");
        const allowedExt = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "weba"];
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const blockedExt = [
          "jpg",
          "jpeg",
          "png",
          "gif",
          "webp",
          "svg",
          "bmp",
          "heic",
          "mp4",
          "mov",
          "avi",
          "mkv",
          "webm",
          "pdf",
          "zip",
        ];
        if (
          file.type.startsWith("image/") ||
          file.type.startsWith("video/") ||
          blockedExt.includes(ext)
        ) {
          throw new Error("Foto/vídeo não rola — manda só o áudio da música.");
        }
        const isAudioMime = file.type.startsWith("audio/");
        if (!isAudioMime && !allowedExt.includes(ext)) {
          throw new Error(
            "Apenas arquivos de áudio são permitidos (MP3, WAV, OGG, M4A, AAC, FLAC)",
          );
        }
        if (file.size > 15 * 1024 * 1024) throw new Error("Arquivo máximo: 15 MB");
        // Decode check: confirm the browser can actually parse this as audio
        const objectUrl = URL.createObjectURL(file);
        const decoded = await new Promise<boolean>((resolve) => {
          const a = new Audio();
          a.preload = "metadata";
          const done = (ok: boolean) => {
            URL.revokeObjectURL(objectUrl);
            resolve(ok);
          };
          a.onloadedmetadata = () => done(Number.isFinite(a.duration) && a.duration > 0);
          a.onerror = () => done(false);
          a.src = objectUrl;
          setTimeout(() => done(false), 4000);
        });
        if (!decoded) throw new Error("Arquivo inválido — não foi possível ler como áudio.");
        const uploadTicket = await createUpload({
          data: {
            roomSlug: room.slug,
            fileName: file.name,
            contentType: file.type || "audio/mpeg",
            title: trackTitle.trim(),
            submitterName: cleanName,
          },
        });
        const { error: uploadErr } = await supabase.storage
          .from("song-uploads")
          .uploadToSignedUrl(uploadTicket.path, uploadTicket.token, file, {
            contentType: file.type || "audio/mpeg",
            upsert: false,
          });
        if (uploadErr) throw new Error(uploadErr.message);
        if (room.require_payment) {
          setPixTarget({
            amountCents: paidRequestCents,
            song: {
              url: uploadTicket.path,
              title: uploadTicket.title,
              source: "upload",
            },
          });
          setPixOpen(true);
          localStorage.setItem("songpix_name", cleanName);
          return;
        }
        await submitStorageUpload({
          data: {
            roomSlug: room.slug,
            storagePath: uploadTicket.path,
            title: trackTitle.trim(),
            submitterName: cleanName,
          },
        });
        setFile(null);
        setTrackTitle("");
        toast.success("Música enviada pro dono da live!");
      } else {
        if (!url.trim()) throw new Error("Cole o link da música");
        if (room.require_payment) {
          setPixTarget({
            amountCents: paidRequestCents,
            song: { url: url.trim(), title: "Pedido pago" },
          });
          setPixOpen(true);
          localStorage.setItem("songpix_name", cleanName);
          return;
        }
        await submit({ data: { roomSlug: room.slug, url: url.trim(), submitterName: cleanName } });
        setUrl("");
        toast.success("Música enviada!");
      }
      localStorage.setItem("songpix_name", cleanName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBoost(itemId: string) {
    if (!room) return;
    const cents = parseCurrencyCents(boostAmount);
    if (!cents || cents <= 0) return toast.error("Valor inválido");
    if (cents < room.min_boost_cents) {
      return toast.error(`Mínimo: ${formatCents(room.min_boost_cents)}`);
    }
    if (room.max_boost_cents && cents > room.max_boost_cents) {
      return toast.error(`Máximo: ${formatCents(room.max_boost_cents)}`);
    }
    const cleanName = normalizeUserHandle(name);
    if (!cleanName) return toast.error("Informe seu @ primeiro");
    setName(cleanName);
    setPixTarget({ itemId, amountCents: cents });
    setPixOpen(true);
    setBoostOpen(null);
    setBoostAmount("");
  }

  const livePlaying = items.find((i) => i.status === "playing") ?? null;
  const { displayed: animatedPlaying, isLeaving: playingLeaving } = useAnimatedSwap(livePlaying);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!room) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Sala não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">Confere o link com o streamer.</p>
        </div>
      </div>
    );
  }

  const playing = animatedPlaying;
  const queuedItems = items.filter((i) => i.status === "queued");
  const topItems = sortQueue(
    items.filter((i) => i.is_top && (i.status === "queued" || i.status === "playing")),
  );
  const topQueuedItems = queuedItems.filter((i) => i.is_top);
  const queue = queuedItems.filter((i) => !i.is_top);
  const highestPaidItem =
    [...items]
      .filter((i) => (i.status === "queued" || i.status === "playing") && i.paid_amount_cents > 0)
      .sort((a, b) => b.paid_amount_cents - a.paid_amount_cents)[0] ?? null;

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
      <div className="relative z-10 mx-auto w-full max-w-6xl overflow-hidden border-x border-border/40 bg-surface/60 backdrop-blur-[1px]">
        <div className="flex flex-col md:flex-row">
          {/* LEFT — Queue Control */}
          <div className="relative min-w-0 flex-1 border-b-2 border-border p-6 sm:p-8 md:border-b-0 md:border-r-2">
            {/* Console header */}
            <header className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
              <div className="flex min-w-0 items-start gap-4">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt=""
                    className="h-20 w-20 shrink-0 border border-border object-cover sm:h-24 sm:w-24"
                  />
                ) : (
                  <div className="grid h-20 w-20 shrink-0 place-items-center border border-dashed border-border bg-surface-2 sm:h-24 sm:w-24">
                    <ListMusic className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <h1 className="truncate font-display text-3xl font-extrabold italic uppercase leading-none tracking-tighter sm:text-4xl">
                    {room.name}
                  </h1>
                  <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                    Estação · {room.slug}
                  </span>
                  {room.description && (
                    <p className="line-clamp-2 max-w-prose pt-1 text-sm text-muted-foreground">
                      {room.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      room.is_open
                        ? "animate-pulse bg-neon shadow-[0_0_10px_var(--neon)]"
                        : "bg-muted-foreground"
                    }`}
                  />
                  <span className="font-display text-xs font-bold uppercase tracking-widest">
                    {room.is_open ? "Sinal Online" : "Fechada"}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  FURA FILA MÍN: {formatCents(room.min_boost_cents)}
                </span>
              </div>
            </header>

            {/* Submit form */}
            {room.is_open && (
              <form onSubmit={handleSubmit} className="mb-8 border border-border bg-black/40 p-4">
                <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
                  <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Pedir Música
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {room.require_payment ? "Pagamento via PIX" : "Envio livre"}
                  </span>
                </div>
                {room.require_payment && (
                  <div className="mb-3 border border-neon/40 bg-neon/[0.08] p-3">
                    <div className="font-display text-xs font-bold uppercase tracking-widest text-neon">
                      Donate da live
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Faça um donate a partir de {formatCents(room.min_boost_cents)} e peça sua
                      música. Confirmou o PIX, ela entra automaticamente na fila.
                    </p>
                    {highestPaidItem && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {highestPaidItem.submitter_name} fez o maior donate da sala:{" "}
                        {formatCents(highestPaidItem.paid_amount_cents)}. Quer ficar na frente?
                        Faça um donate acima desse valor.
                      </p>
                    )}
                  </div>
                )}
                {room.allow_upload && (
                  <div className="mb-3 inline-flex border border-border">
                    <button
                      type="button"
                      onClick={() => setMode("link")}
                      className={`px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest ${
                        mode === "link" ? "bg-neon text-neon-foreground" : "text-muted-foreground"
                      }`}
                    >
                      Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("upload")}
                      className={`px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest ${
                        mode === "upload" ? "bg-neon text-neon-foreground" : "text-muted-foreground"
                      }`}
                    >
                      Upload
                    </button>
                  </div>
                )}
                {mode === "upload" && room.allow_upload ? (
                  <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                    <input
                      type="text"
                      placeholder="@seuusuario"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={32}
                      inputMode="text"
                      autoComplete="username"
                      aria-label="@ do usuário"
                      className="border border-border bg-background px-3 py-2 font-mono text-sm lowercase outline-none focus:border-neon"
                    />
                    <div className="grid gap-2">
                      <input
                        type="text"
                        placeholder="Nome da música"
                        value={trackTitle}
                        onChange={(e) => setTrackTitle(e.target.value)}
                        maxLength={120}
                        className="border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                      />
                      {room.require_payment && (
                        <div className="grid gap-1">
                          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            Valor do apoio
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder={formatInputCents(room.min_boost_cents)}
                            value={requestAmount}
                            onChange={(e) => setRequestAmount(e.target.value)}
                            className="border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-neon"
                          />
                        </div>
                      )}
                      <label className="inline-flex cursor-pointer items-center gap-2 border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:border-neon hover:text-neon">
                        <Upload className="h-4 w-4" />
                        <span className="truncate">
                          {file ? file.name : "Selecionar áudio (MP3/WAV/OGG/M4A · máx 15MB)"}
                        </span>
                        <input
                          type="file"
                          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/webm,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus"
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            if (f) {
                              const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
                              const okExt = [
                                "mp3",
                                "wav",
                                "ogg",
                                "m4a",
                                "aac",
                                "flac",
                                "opus",
                                "weba",
                              ].includes(ext);
                              if (!f.type.startsWith("audio/") && !okExt) {
                                toast.error("Apenas arquivos de áudio são permitidos");
                                e.target.value = "";
                                return;
                              }
                            }
                            setFile(f);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center justify-center gap-1 border border-neon bg-neon px-4 py-2 font-display text-xs font-bold uppercase tracking-widest text-neon-foreground transition-all hover:opacity-90 disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                        </>
                      ) : (
                        <>
                          {room.require_payment ? (
                            <>
                              <Zap className="h-4 w-4" /> Pagar e enviar
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" /> Enviar
                            </>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div
                    className={`grid gap-2 ${
                      room.require_payment
                        ? "sm:grid-cols-[140px_1fr_140px_auto]"
                        : "sm:grid-cols-[140px_1fr_auto]"
                    }`}
                  >
                    <input
                      type="text"
                      placeholder="@seuusuario"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={32}
                      inputMode="text"
                      autoComplete="username"
                      aria-label="@ do usuário"
                      className="border border-border bg-background px-3 py-2 font-mono text-sm lowercase outline-none focus:border-neon"
                    />
                    <input
                      type="url"
                      placeholder="Cole o link (YouTube / Spotify / SoundCloud)"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon"
                    />
                    {room.require_payment && (
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={formatInputCents(room.min_boost_cents)}
                        value={requestAmount}
                        onChange={(e) => setRequestAmount(e.target.value)}
                        aria-label="Valor do apoio"
                        className="border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-neon"
                      />
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center justify-center gap-1 border border-neon bg-neon px-4 py-2 font-display text-xs font-bold uppercase tracking-widest text-neon-foreground transition-all hover:opacity-90 disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                        </>
                      ) : (
                        <>
                          {room.require_payment ? (
                            <>
                              <Zap className="h-4 w-4" /> Pagar e enviar
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" /> Enviar
                            </>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* Tabs */}
            <div className="mb-4 inline-flex flex-wrap border border-border bg-black/40">
              {(["queue", "top", "history"] as const).map((t) => {
                const count =
                  t === "queue"
                    ? queuedItems.length + (playing ? 1 : 0)
                    : t === "top"
                      ? topItems.length
                      : history.length;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`px-4 py-2 font-display text-[10px] font-bold uppercase tracking-widest transition ${
                      tab === t
                        ? "bg-neon text-neon-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "queue" ? "Fila" : t === "top" ? "★ Top" : "Histórico"}
                    <span className="ml-2 font-mono text-[9px] opacity-70">
                      {count.toString().padStart(2, "0")}
                    </span>
                  </button>
                );
              })}
            </div>

            {tab === "queue" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Fila Prioritária
                  </h2>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {queue.length.toString().padStart(2, "0")} MÚSICAS
                  </span>
                </div>

                {/* Now playing */}
                {playing ? (
                  <div
                    key={playing.id}
                    className={`relative flex items-center gap-5 overflow-hidden bg-neon p-5 text-neon-foreground [--marquee-fade:var(--neon)] ${playingLeaving ? "animate-[soft-out_0.9s_cubic-bezier(0.4,0,0.2,1)_both]" : "animate-[soft-in_1.4s_cubic-bezier(0.22,1,0.36,1)_both]"}`}
                  >
                    <div className="absolute right-0 top-0 bg-neon-foreground px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-tighter text-neon">
                      No Ar
                    </div>
                    {playing.is_top && (
                      <div className="absolute left-0 top-0 inline-flex items-center gap-1 bg-background px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-tighter text-neon">
                        <Star className="h-2.5 w-2.5 fill-current" /> Top da Sala
                      </div>
                    )}
                    <div className="relative z-10">
                      {playing.thumbnail_url ? (
                        <img
                          src={playing.thumbnail_url}
                          alt=""
                          className="h-16 w-16 shrink-0 border border-neon-foreground/30 object-cover sm:h-20 sm:w-20"
                        />
                      ) : (
                        <div className="h-16 w-16 shrink-0 border border-neon-foreground/30 bg-background sm:h-20 sm:w-20" />
                      )}
                    </div>
                    <div className="relative z-10 min-w-0 flex-1">
                      <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-neon-foreground/80">
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neon-foreground align-middle" />
                        Tocando Agora
                      </p>
                      <Marquee
                        className="font-display text-lg font-bold tracking-tight sm:text-xl"
                        speed={45}
                      >
                        {playing.title}
                      </Marquee>
                      <p className="mt-1 truncate text-xs font-medium text-neon-foreground/70">
                        {playing.artist ?? playing.source} · enviado por {playing.submitter_name}
                      </p>
                    </div>
                    {/* equalizer — bottom right */}
                    <div className="pointer-events-none absolute bottom-2 right-2 z-10 flex h-6 items-end gap-[3px]">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className="w-[3px] bg-neon-foreground animate-[eqbar_0.7s_ease-in-out_infinite_alternate]"
                          style={{ animationDelay: `${i * 0.12}s` }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-border bg-black/40 p-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Aguardando primeira música
                  </div>
                )}

                {/* Top da Fila */}
                {topQueuedItems.length > 0 && (
                  <div
                    className={`space-y-2 transition-all duration-700 ${playingLeaving ? "opacity-40 blur-[2px]" : "opacity-100"}`}
                  >
                    <div className="flex items-center justify-between border-b border-neon/30 pb-2">
                      <h2 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-neon">
                        <Star className="h-3 w-3 fill-current" /> Top da Fila
                      </h2>
                      <span className="font-mono text-[10px] text-neon/70">
                        {topQueuedItems.length.toString().padStart(2, "0")} ESCOLHIDAS
                      </span>
                    </div>
                    {topQueuedItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="relative border border-border bg-black/40 animate-[soft-in_0.9s_cubic-bezier(0.22,1,0.36,1)_both]"
                        style={{ animationDelay: `${idx * 90}ms` }}
                      >
                        <div className="absolute left-0 top-0 inline-flex items-center gap-1 bg-primary px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-tighter text-primary-foreground">
                          <Star className="h-2.5 w-2.5 fill-current" /> Top da Sala
                        </div>
                        <div className="flex items-center gap-3 p-3 sm:gap-5 sm:p-6">
                          {item.thumbnail_url ? (
                            <img
                              src={item.thumbnail_url}
                              alt=""
                              className="h-14 w-14 shrink-0 border border-border object-cover sm:h-20 sm:w-20"
                            />
                          ) : (
                            <div className="grid h-14 w-14 shrink-0 place-items-center border border-border bg-surface-2 sm:h-20 sm:w-20">
                              <ListMusic className="h-5 w-5 text-muted-foreground/60 sm:h-6 sm:w-6" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <Marquee className="text-sm font-bold sm:text-lg">{item.title}</Marquee>
                            {item.artist && (
                              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                                {item.artist}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <SourceBadge source={item.source} />
                              <span className="truncate font-mono text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
                                {item.submitter_name}
                              </span>
                            </div>
                          </div>
                          {item.paid_amount_cents > 0 && (
                            <div className="skew-x-[-12deg] shrink-0 self-start border border-neon bg-neon px-2 py-1 font-display text-[10px] font-bold text-neon-foreground sm:self-center sm:px-3">
                              <span className="inline-block skew-x-[12deg] tabular-nums">
                                {formatCents(item.paid_amount_cents)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Queue header */}
                {topQueuedItems.length > 0 && queue.length > 0 && (
                  <div className="flex items-center justify-between border-b border-border pb-2 pt-2">
                    <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Resto da Fila
                    </h2>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {queue.length.toString().padStart(2, "0")} MÚSICAS
                    </span>
                  </div>
                )}

                {/* Queue items */}
                <div className="space-y-2">
                  {queue.length === 0 && topQueuedItems.length === 0 ? (
                    <div className="border border-dashed border-border bg-black/40 p-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      Fila vazia — manda a sua
                    </div>
                  ) : (
                    queue.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`border animate-[soft-in_0.9s_cubic-bezier(0.22,1,0.36,1)_both] ${"border-border bg-black/40"}`}
                        style={{ animationDelay: `${idx * 90}ms` }}
                      >
                        <div className="flex items-center gap-3 p-3 sm:gap-5 sm:p-6">
                          <span className="hidden w-10 shrink-0 text-center font-display text-3xl font-bold tabular-nums text-muted-foreground/40 sm:block sm:text-4xl">
                            {(idx + 1).toString().padStart(2, "0")}
                          </span>
                          {item.thumbnail_url ? (
                            <img
                              src={item.thumbnail_url}
                              alt=""
                              className="h-14 w-14 shrink-0 border border-border object-cover sm:h-20 sm:w-20"
                            />
                          ) : (
                            <div className="grid h-14 w-14 shrink-0 place-items-center border border-border bg-surface-2 sm:h-20 sm:w-20">
                              <ListMusic className="h-5 w-5 text-muted-foreground/60 sm:h-6 sm:w-6" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-baseline gap-2">
                              <span className="font-display text-base font-bold tabular-nums text-muted-foreground/50 sm:hidden">
                                {(idx + 1).toString().padStart(2, "0")}
                              </span>
                              <Marquee className="min-w-0 flex-1 text-sm font-bold sm:text-lg">
                                {item.title}
                              </Marquee>
                            </div>
                            {item.artist && (
                              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                                {item.artist}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <SourceBadge source={item.source} />
                              <span className="truncate font-mono text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
                                {item.submitter_name}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            {item.paid_amount_cents > 0 ? (
                              <div className="skew-x-[-12deg] border border-neon bg-neon px-2 py-1 font-display text-[10px] font-bold text-neon-foreground sm:px-3">
                                <span className="inline-block skew-x-[12deg] tabular-nums">
                                  {formatCents(item.paid_amount_cents)}
                                </span>
                              </div>
                            ) : (
                              <div className="skew-x-[-12deg] border border-border bg-surface-2 px-2 py-1 font-display text-[10px] font-bold text-muted-foreground sm:px-3">
                                <span className="inline-block skew-x-[12deg]">FREE</span>
                              </div>
                            )}
                            <button
                              onClick={() => {
                                setBoostOpen(boostOpen === item.id ? null : item.id);
                                setBoostAmount("");
                              }}
                              className="inline-flex items-center gap-1 border border-neon/40 bg-transparent px-2 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-neon transition-all hover:bg-neon hover:text-neon-foreground sm:px-2.5"
                            >
                              <Zap className="h-3 w-3" /> Fura fila
                            </button>
                          </div>
                        </div>
                        {boostOpen === item.id && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-3">
                            <span className="font-mono text-[10px] uppercase text-muted-foreground">
                              R$
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min={room.min_boost_cents / 100}
                              max={room.max_boost_cents ? room.max_boost_cents / 100 : undefined}
                              value={boostAmount}
                              onChange={(e) => setBoostAmount(e.target.value)}
                              placeholder={(room.min_boost_cents / 100).toFixed(2)}
                              className="w-24 border border-border bg-surface px-2 py-1.5 font-mono text-sm outline-none focus:border-neon"
                            />
                            <button
                              onClick={() => handleBoost(item.id)}
                              className="border border-neon bg-neon px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-neon-foreground hover:opacity-90"
                            >
                              Furar a Fila
                            </button>
                            <span className="ml-auto font-mono text-[10px] uppercase text-muted-foreground">
                              mín. {formatCents(room.min_boost_cents)}
                            </span>
                            {highestPaidItem && (
                              <p className="basis-full text-[11px] leading-relaxed text-muted-foreground">
                                {highestPaidItem.submitter_name} fez o maior donate da sala:{" "}
                                {formatCents(highestPaidItem.paid_amount_cents)}. Para ficar na
                                frente, faça um donate acima desse valor.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {tab === "top" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-neon/30 pb-2">
                  <h2 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-neon">
                    <Star className="h-3 w-3 fill-current" /> Top da Sala
                  </h2>
                  <span className="font-mono text-[10px] text-neon/70">
                    {topItems.length.toString().padStart(2, "0")} ESCOLHIDAS
                  </span>
                </div>
                {topItems.length === 0 ? (
                  <div className="border border-dashed border-border bg-black/40 p-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    O dono da live ainda não destacou nenhuma música
                  </div>
                ) : (
                  topItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 border border-neon/40 bg-neon/[0.06] p-3 sm:p-4 animate-[soft-in_0.9s_cubic-bezier(0.22,1,0.36,1)_both]"
                      style={{ animationDelay: `${idx * 80}ms` }}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center border border-neon bg-neon/15 font-display text-sm font-bold tabular-nums text-neon">
                        {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt=""
                          className="h-14 w-14 shrink-0 border border-neon/40 object-cover"
                        />
                      ) : (
                        <div className="grid h-14 w-14 shrink-0 place-items-center border border-neon/40 bg-surface-2">
                          <ListMusic className="h-4 w-4 text-neon/60" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          {item.status === "playing" && (
                            <span className="inline-flex shrink-0 items-center gap-1 border border-neon/40 bg-neon/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-neon">
                              Tocando agora
                            </span>
                          )}
                          <Marquee className="min-w-0 flex-1 text-sm font-bold sm:text-base">
                            {item.title}
                          </Marquee>
                        </div>
                        {item.artist && (
                          <Marquee className="text-xs text-muted-foreground">{item.artist}</Marquee>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <SourceBadge source={item.source} />
                          <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            {item.submitter_name}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "history" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Histórico
                  </h2>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {history.length.toString().padStart(2, "0")} TOCADAS
                  </span>
                </div>
                {history.length === 0 ? (
                  <div className="border border-dashed border-border bg-black/40 p-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Nada tocado ainda
                  </div>
                ) : (
                  history.map((h, idx) => (
                    <div
                      key={h.id}
                      className="flex items-center gap-3 border border-border bg-black/40 p-3 sm:p-4"
                    >
                      <span className="hidden w-8 shrink-0 text-center font-display text-xl font-bold tabular-nums text-muted-foreground/40 sm:block">
                        {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      {h.thumbnail_url ? (
                        <img
                          src={h.thumbnail_url}
                          alt=""
                          className="h-12 w-12 shrink-0 border border-border object-cover opacity-70"
                        />
                      ) : (
                        <div className="grid h-12 w-12 shrink-0 place-items-center border border-border bg-surface-2">
                          <ListMusic className="h-4 w-4 text-muted-foreground/60" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <Marquee className="text-sm font-bold">{h.title}</Marquee>
                        {h.artist && (
                          <Marquee className="text-xs text-muted-foreground">{h.artist}</Marquee>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <SourceBadge source={h.source} />
                          <div className="min-w-0 flex-1">
                            <Marquee className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              {h.submitter_name}
                            </Marquee>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
                            h.status === "played"
                              ? "border-neon/40 bg-neon/10 text-neon"
                              : "border-border bg-surface-2 text-muted-foreground"
                          }`}
                        >
                          {h.status === "played" ? "Tocou" : "Pulada"}
                        </span>
                        {h.played_at && (
                          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            {new Date(h.played_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* RIGHT — Metrics & Terminal */}
          <aside className="w-full bg-surface-2 p-6 sm:p-8 md:w-80">
            <section>
              <h2 className="mb-6 border-l-2 border-neon pl-2 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Dados da Sessão
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div className="border border-border bg-background p-5">
                  <span className="mb-2 block font-mono text-[10px] font-bold uppercase text-muted-foreground">
                    Músicas na Fila
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl font-bold tabular-nums tracking-tighter">
                      {queue.length}
                    </span>
                  </div>
                </div>
                <div className="border border-border bg-background p-5">
                  <span className="mb-2 block font-mono text-[10px] font-bold uppercase text-muted-foreground">
                    Fura filas ativos
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-3xl font-bold tabular-nums tracking-tighter text-neon">
                      {items.filter((i) => i.paid_amount_cents > 0).length}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="mb-4 border-l-2 border-neon pl-2 font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Top da Fila
              </h2>
              <div className="space-y-2 font-mono text-[10px] uppercase leading-tight text-muted-foreground">
                {queue.slice(0, 5).map((it, i) => (
                  <p key={it.id} className="truncate">
                    <span
                      className={
                        it.paid_amount_cents > 0 ? "text-neon" : "text-muted-foreground/60"
                      }
                    >
                      [{(i + 1).toString().padStart(2, "0")}]
                    </span>{" "}
                    {it.title.slice(0, 28)}
                  </p>
                ))}
                {queue.length === 0 && <p>— sem registros —</p>}
              </div>
            </section>

            <footer className="mt-10 flex items-center justify-between border-t border-border pt-6">
              <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                <ListMusic className="h-3 w-3" /> SongPIX
              </div>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                v1.0
              </span>
            </footer>
          </aside>
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-5xl text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        ⚡ Pagamentos PIX processados via Mercado Pago
      </p>

      {pixTarget && room && (
        <PixCheckoutModal
          open={pixOpen}
          onClose={() => setPixOpen(false)}
          roomSlug={room.slug}
          amountCents={pixTarget.amountCents}
          payerName={normalizeUserHandle(name) || "Anônimo"}
          existingItemId={pixTarget.itemId}
          song={pixTarget.song}
          onApproved={() => {
            setUrl("");
            setFile(null);
            setTrackTitle("");
            setPixTarget(null);
          }}
        />
      )}
    </div>
  );
}
