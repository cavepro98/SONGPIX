import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  Check,
  Copy,
  ExternalLink,
  GripVertical,
  ListMusic,
  Monitor,
  MoreHorizontal,
  Play,
  SkipForward,
  Star,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { MusicPlayer } from "@/components/MusicPlayer";
import { AppShell } from "@/components/AppShell";
import { Pagination, paginate } from "@/components/Pagination";
import { useCoverUrl } from "@/lib/use-cover-url";
import { SourceBadge } from "@/components/SourceBadge";
import { Marquee } from "@/components/Marquee";
import { useAnimatedSwap } from "@/hooks/use-animated-swap";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { dispatchOverlayAlertTest } from "@/lib/overlay-alert-test";
import { triggerOverlayAlertTest } from "@/lib/overlay-alert.functions";
import { listRoomPayments } from "@/lib/payments.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/rooms/$slug")({
  head: () => ({ meta: [{ title: "Painel da sala | SongPIX" }] }),
  component: RoomPanel,
});

type Progress = { currentTime: number; duration: number };

const ROOM_SPOTIFY_TIPS_STORAGE_KEY = "songpix-room-spotify-tips-seen";

function fmtTime(totalSeconds: number) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function OwnerPlayer({
  item,
  onEnded,
  onProgress,
}: {
  item: QueueItem;
  onEnded?: () => void;
  onProgress?: (p: Progress) => void;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    setResolvedUrl(null);
    if (item.source === "upload") {
      supabase.storage
        .from("song-uploads")
        .createSignedUrl(item.url, 60 * 60)
        .then(({ data, error }) => {
          if (!mounted) return;
          if (error || !data?.signedUrl) {
            console.error("[OwnerPlayer] signed url error:", error, "path:", item.url);
            setError(error?.message ?? "Não foi possível gerar o link do áudio");
            return;
          }
          setResolvedUrl(data.signedUrl);
        })
        .catch((e) => {
          if (!mounted) return;
          console.error("[OwnerPlayer] exception:", e);
          setError(e instanceof Error ? e.message : "Erro ao carregar áudio");
        });
    } else {
      setResolvedUrl(item.url);
    }
    return () => {
      mounted = false;
    };
  }, [item.id, item.source, item.url]);

  if (error) {
    return (
      <div className="space-y-2 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        <div>Falha ao carregar áudio: {error}</div>
        <div className="font-mono text-[10px] opacity-70 break-all">path: {item.url}</div>
      </div>
    );
  }

  if (!resolvedUrl) {
    return (
      <div className="grid h-24 place-items-center border border-border bg-black text-xs text-muted-foreground">
        Carregando player…
      </div>
    );
  }
  return (
    <MusicPlayer url={resolvedUrl} source={item.source} onEnded={onEnded} onProgress={onProgress} />
  );
}

type Room = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_open: boolean;
  min_boost_cents: number;
};

type QueueItem = {
  id: string;
  title: string;
  artist: string | null;
  thumbnail_url: string | null;
  source: string;
  url: string;
  submitter_name: string;
  paid_amount_cents: number;
  status: string;
  created_at: string;
  duration_sec: number | null;
  is_top: boolean;
  manual_order: number | null;
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

function RoomPanel() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const coverUrl = useCoverUrl(room?.cover_url ?? null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<(QueueItem & { played_at: string | null })[]>([]);
  const [tab, setTab] = useState<"queue" | "top" | "history" | "earnings">("queue");
  const [historyPage, setHistoryPage] = useState(1);
  const [earningsPage, setEarningsPage] = useState(1);
  const fetchPayments = useServerFn(listRoomPayments);
  const [earnings, setEarnings] = useState<{
    totals: { gross: number; net: number; commission: number };
    payments: Array<{
      id: string;
      payer_name: string;
      amount_cents: number;
      net_cents: number;
      commission_cents: number;
      status: string;
      created_at: string;
      paid_at: string | null;
      song_payload: Record<string, unknown> | null;
    }>;
  } | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const savedDurationsRef = useRef<Record<string, number>>({});
  const playerProgressChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastBroadcastProgressRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [spotifyTipsOpen, setSpotifyTipsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: r, error } = await supabase
        .from("rooms")
        .select("id, slug, name, description, cover_url, is_open, min_boost_cents")
        .eq("slug", slug)
        .eq("owner_id", uid)
        .is("archived_at", null)
        .maybeSingle();
      if (!mounted) return;
      if (error || !r) {
        toast.error("Sala não encontrada");
        navigate({ to: "/dashboard" });
        return;
      }
      setRoom(r);
      const { data: q } = await supabase
        .from("queue_items")
        .select("*")
        .eq("room_id", r.id)
        .in("status", ["queued", "playing"]);
      if (!mounted) return;
      setItems(sortQueue((q ?? []) as QueueItem[]));
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [slug, navigate]);

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
    }
    async function refetchHistory() {
      const { data: h } = await supabase
        .from("queue_items")
        .select("*")
        .eq("room_id", roomId)
        .in("status", ["played", "skipped"])
        .order("played_at", { ascending: false })
        .limit(50);
      setHistory((h ?? []) as (QueueItem & { played_at: string | null })[]);
    }
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_items", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === "INSERT") {
              const next = [...prev, payload.new as QueueItem];
              return sortQueue(next.filter((i) => ["queued", "playing"].includes(i.status)));
            }
            if (payload.eventType === "UPDATE") {
              const next = prev.map((i) =>
                i.id === (payload.new as QueueItem).id ? (payload.new as QueueItem) : i,
              );
              return sortQueue(next.filter((i) => ["queued", "playing"].includes(i.status)));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((i) => i.id !== (payload.old as QueueItem).id);
            }
            return prev;
          });
          if (payload.eventType !== "INSERT") refetchHistory();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          refetch();
          refetchHistory();
        }
      });
    playerProgressChannelRef.current = channel;
    function onVisible() {
      if (document.visibilityState === "visible") {
        refetch();
        refetchHistory();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      if (playerProgressChannelRef.current === channel) {
        playerProgressChannelRef.current = null;
      }
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [room]);

  useEffect(() => {
    if (!room || typeof window === "undefined") return;
    if (!window.localStorage.getItem(ROOM_SPOTIFY_TIPS_STORAGE_KEY)) {
      setSpotifyTipsOpen(true);
    }
  }, [room]);

  useEffect(() => {
    setHistoryPage(1);
  }, [history.length]);

  useEffect(() => {
    setEarningsPage(1);
  }, [earnings?.payments.length]);

  function closeSpotifyTips() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ROOM_SPOTIFY_TIPS_STORAGE_KEY, "1");
    }
    setSpotifyTipsOpen(false);
  }

  async function toggleOpen() {
    if (!room) return;
    const { error } = await supabase
      .from("rooms")
      .update({ is_open: !room.is_open })
      .eq("id", room.id);
    if (error) return toast.error(error.message);
    setRoom({ ...room, is_open: !room.is_open });
  }

  async function setStatus(id: string, status: "playing" | "played" | "skipped") {
    const patch: { status: string; played_at?: string } = { status };
    if (status === "played" || status === "skipped") patch.played_at = new Date().toISOString();
    const { error } = await supabase.from("queue_items").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function finishAndPlayNext(id: string, status: "played" | "skipped") {
    const { error } = await supabase
      .from("queue_items")
      .update({ status, played_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setProgress(null);
    const queued = sortQueue(items.filter((i) => i.status === "queued" && i.id !== id));
    const next = queued[0];
    if (next) {
      const { error: e2 } = await supabase
        .from("queue_items")
        .update({ status: "playing" })
        .eq("id", next.id);
      if (e2) return toast.error(e2.message);
      toast.success(`Próxima: ${next.title}`);
    } else {
      toast.success("Fila vazia");
    }
  }

  function handlePlayerProgress(item: QueueItem, nextProgress: Progress) {
    setProgress(nextProgress);

    const duration = Math.round(nextProgress.duration);
    if (!Number.isFinite(duration) || duration <= 0) return;

    const currentTime = Math.max(0, Math.min(duration, Math.floor(nextProgress.currentTime)));
    const progressKey = `${item.id}:${currentTime}:${duration}`;
    if (lastBroadcastProgressRef.current !== progressKey) {
      lastBroadcastProgressRef.current = progressKey;
      void playerProgressChannelRef.current?.send({
        type: "broadcast",
        event: "player-progress",
        payload: { itemId: item.id, currentTime, duration },
      });
    }

    const savedDuration = savedDurationsRef.current[item.id];
    if (
      (savedDuration && Math.abs(savedDuration - duration) <= 1) ||
      (item.duration_sec && Math.abs(item.duration_sec - duration) <= 1)
    ) {
      savedDurationsRef.current[item.id] = duration;
      return;
    }

    savedDurationsRef.current[item.id] = duration;
    void supabase
      .from("queue_items")
      .update({ duration_sec: duration })
      .eq("id", item.id)
      .then(({ error }) => {
        if (error) {
          delete savedDurationsRef.current[item.id];
          console.error("[OwnerPlayer] duration update error:", error);
          return;
        }
        setItems((current) =>
          current.map((queueItem) =>
            queueItem.id === item.id ? { ...queueItem, duration_sec: duration } : queueItem,
          ),
        );
      });
  }

  async function playNow(id: string) {
    const current = items.find((i) => i.status === "playing");
    if (current && current.id !== id) {
      const { error: e1 } = await supabase
        .from("queue_items")
        .update({ status: "played", played_at: new Date().toISOString() })
        .eq("id", current.id);
      if (e1) return toast.error(e1.message);
    }
    const { error } = await supabase.from("queue_items").update({ status: "playing" }).eq("id", id);
    if (error) return toast.error(error.message);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("queue_items").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  async function toggleTop(item: QueueItem) {
    const newVal = !item.is_top;
    if (newVal) {
      const currentTopCount = items.filter(
        (i) => i.is_top && (i.status === "queued" || i.status === "playing"),
      ).length;
      if (currentTopCount >= 10) {
        return toast.error("Limite do Top atingido (10 músicas)");
      }
    }
    setItems((prev) =>
      sortQueue(prev.map((i) => (i.id === item.id ? { ...i, is_top: newVal } : i))),
    );
    const { error } = await supabase
      .from("queue_items")
      .update({ is_top: newVal })
      .eq("id", item.id);
    if (error) {
      setItems((prev) =>
        sortQueue(prev.map((i) => (i.id === item.id ? { ...i, is_top: !newVal } : i))),
      );
      return toast.error(error.message);
    }
    toast.success(newVal ? "Adicionada ao Top da Fila" : "Removida do Top");
  }

  async function reorderGroup(reordered: QueueItem[]) {
    const updates = reordered.map((it, i) =>
      supabase
        .from("queue_items")
        .update({ manual_order: (i + 1) * 10 })
        .eq("id", it.id),
    );
    setItems((prev) => {
      const map = new Map(reordered.map((it, i) => [it.id, (i + 1) * 10]));
      return sortQueue(
        prev.map((i) => (map.has(i.id) ? { ...i, manual_order: map.get(i.id)! } : i)),
      );
    });
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) toast.error(err.error.message);
  }

  async function moveItem(item: QueueItem, dir: -1 | 1) {
    const group = sortQueue(items.filter((i) => i.status === "queued" && i.is_top === item.is_top));
    const idx = group.findIndex((i) => i.id === item.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= group.length) return;
    const reordered = [...group];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    await reorderGroup(reordered);
  }

  function handleDrop(targetId: string, group: QueueItem[]) {
    const sourceId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const from = group.findIndex((i) => i.id === sourceId);
    const to = group.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...group];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    void reorderGroup(reordered);
  }

  function copyLink() {
    const url = `${window.location.origin}/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  }

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  async function resetRoom() {
    if (!room) return;
    if (
      !confirm(
        "Reiniciar a sala? Todas as músicas (fila, top, histórico) serão removidas. Seus ganhos anteriores serão preservados.",
      )
    )
      return;
    const { error } = await supabase.from("queue_items").delete().eq("room_id", room.id);
    if (error) return toast.error(error.message);
    setActionsOpen(false);
    toast.success("Sala reiniciada — ganhos preservados");
  }

  const livePlaying = items.find((i) => i.status === "playing") ?? null;
  const { displayed: animatedPlaying, isLeaving: playingLeaving } = useAnimatedSwap(livePlaying);

  if (loading || !room) {
    return (
      <AppShell active="room" roomSlug={slug} contextLabel="Carregando sala">
        <div className="space-y-4">
          <div className="h-20 animate-pulse rounded-xl bg-surface" />
          <div className="h-64 animate-pulse rounded-xl bg-surface" />
        </div>
      </AppShell>
    );
  }

  const playing = animatedPlaying;
  const queue = items.filter((i) => i.status === "queued");
  const topItems = sortQueue(
    items.filter((i) => i.is_top && (i.status === "queued" || i.status === "playing")),
  );
  const topQueuedItems = sortQueue(items.filter((i) => i.is_top && i.status === "queued"));
  const totalCents =
    items.reduce((s, i) => s + i.paid_amount_cents, 0) +
    history.reduce((s, i) => s + i.paid_amount_cents, 0);
  const pagedHistory = paginate(history, historyPage);
  const approvedPayments = earnings?.payments.filter((p) => p.status === "approved") ?? [];
  const pagedApprovedPayments = paginate(approvedPayments, earningsPage);

  return (
    <>
      <AppShell
        active="room"
        roomSlug={slug}
        contextLabel={room.name}
        roomOpen={room.is_open}
        topbarActions={
          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={copyLink}
              className="app-focus inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:border-neon/50 hover:text-foreground"
            >
              <Copy className="h-4 w-4" /> <span className="hidden xl:inline">Copiar link</span>
            </button>
            <a
              href={`/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="app-focus inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:border-neon/50 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden xl:inline">Página pública</span>
            </a>
            <button
              onClick={() => setOverlayOpen(true)}
              className="app-focus inline-flex h-10 items-center gap-2 rounded-lg bg-neon px-3 text-xs font-semibold text-neon-foreground hover:opacity-90"
            >
              <Monitor className="h-4 w-4" /> Widgets
            </button>
            <div className="relative">
              <button
                onClick={() => setActionsOpen((open) => !open)}
                className="app-focus grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground hover:border-neon/50 hover:text-foreground"
                aria-label="Mais ações"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 top-12 z-40 w-52 rounded-xl border border-border bg-popover p-2 shadow-2xl">
                  <button
                    onClick={() => {
                      setSpotifyTipsOpen(true);
                      setActionsOpen(false);
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <Play className="h-4 w-4" /> Dicas do Spotify
                  </button>
                  <button
                    onClick={resetRoom}
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" /> Reiniciar sala
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover sm:h-20 sm:w-20"
              />
            ) : (
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-dashed border-border bg-surface-2 text-xs text-muted-foreground sm:h-20 sm:w-20">
                Sem capa
              </div>
            )}
            <div className="min-w-0 space-y-1">
              <span className="eyebrow block">Painel da sala</span>
              <h1 className="page-title truncate">{room.name}</h1>
              {room.description && (
                <p className="line-clamp-2 max-w-prose text-sm text-muted-foreground">
                  {room.description}
                </p>
              )}
              <p className="text-xs font-medium text-neon">songpix.app/{room.slug}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-stretch gap-2 sm:items-center">
            <div className="app-card flex-1 px-4 py-2.5 text-left sm:flex-none sm:text-right">
              <div className="text-[10px] font-medium text-muted-foreground">Arrecadado</div>
              <div className="text-lg font-bold tabular-nums text-neon">
                {formatCents(totalCents)}
              </div>
            </div>
            <button
              onClick={toggleOpen}
              className={`app-focus min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold sm:flex-none ${
                room.is_open
                  ? "border border-neon bg-neon text-neon-foreground"
                  : "border border-border bg-surface text-muted-foreground"
              }`}
            >
              {room.is_open ? "● Aberta" : "○ Fechada"}
            </button>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-4 gap-2 md:hidden">
          <button
            onClick={copyLink}
            className="app-focus inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground"
          >
            <Copy className="h-4 w-4" /> Link
          </button>
          <button
            onClick={() => setOverlayOpen(true)}
            className="app-focus inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-neon text-xs font-semibold text-neon-foreground"
          >
            <Monitor className="h-4 w-4" /> Widgets
          </button>
          <a
            href={`/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="app-focus inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground"
          >
            <ExternalLink className="h-4 w-4" /> Página
          </a>
          <div className="relative">
            <button
              onClick={() => setActionsOpen((open) => !open)}
              className="app-focus inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground"
            >
              <MoreHorizontal className="h-4 w-4" /> Mais
            </button>
            {actionsOpen && (
              <div className="absolute right-0 top-12 z-40 w-52 rounded-xl border border-border bg-popover p-2 shadow-2xl">
                <button
                  onClick={() => {
                    setSpotifyTipsOpen(true);
                    setActionsOpen(false);
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
                >
                  <Play className="h-4 w-4" /> Dicas do Spotify
                </button>
                <button
                  onClick={resetRoom}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Reiniciar sala
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 inline-flex w-fit max-w-full overflow-x-auto bg-surface-2/70 p-1">
          {(["queue", "top", "history", "earnings"] as const).map((t) => {
            const count =
              t === "queue"
                ? items.filter((i) => i.status === "queued" || i.status === "playing").length
                : t === "top"
                  ? topItems.length
                  : t === "history"
                    ? history.length
                    : (earnings?.payments.length ?? 0);
            return (
              <button
                key={t}
                type="button"
                onClick={async () => {
                  setTab(t);
                  if (t === "earnings" && room && !earnings && !earningsLoading) {
                    setEarningsLoading(true);
                    try {
                      const data = await fetchPayments({ data: { roomId: room.id } });
                      setEarnings(data as unknown as typeof earnings);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Erro ao carregar ganhos");
                    } finally {
                      setEarningsLoading(false);
                    }
                  }
                }}
                className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition sm:px-4 ${
                  tab === t
                    ? "bg-neon text-neon-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "queue"
                  ? "Fila"
                  : t === "top"
                    ? "★ Top 10"
                    : t === "history"
                      ? "Histórico"
                      : "💰 Ganhos"}
                <span className="ml-1.5 text-[10px] opacity-70">
                  {count.toString().padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>

        <section className={`mt-5 space-y-5 ${tab === "queue" ? "" : "hidden"}`}>
          {/* Header da fila — igual ao público */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Fila Prioritária
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="font-mono text-[10px] text-muted-foreground">
                {queue.length.toString().padStart(2, "0")} MÚSICAS
              </span>
            </div>
          </div>
          {/* Now playing */}
          {playing ? (
            <div
              key={playing.id}
              className={`relative flex flex-col gap-4 overflow-hidden rounded-xl bg-neon p-4 text-neon-foreground [--marquee-fade:var(--neon)] sm:p-5 ${playingLeaving ? "animate-[soft-out_0.9s_cubic-bezier(0.4,0,0.2,1)_both]" : "animate-[soft-in_1.4s_cubic-bezier(0.22,1,0.36,1)_both]"}`}
            >
              <div className="absolute right-0 top-0 z-20 bg-background px-2 py-1 font-mono text-[10px] font-bold tabular-nums tracking-wider text-neon">
                {progress && progress.duration > 0
                  ? `-${fmtTime(Math.max(0, progress.duration - progress.currentTime))}`
                  : "--:--"}
              </div>
              {playing.is_top && (
                <div className="absolute left-0 top-0 inline-flex items-center gap-1 bg-background px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-tighter text-neon">
                  <Star className="h-2.5 w-2.5 fill-current" /> Top da Sala
                </div>
              )}
              <div className="flex items-center gap-5">
                {playing.thumbnail_url ? (
                  <img
                    src={playing.thumbnail_url}
                    alt=""
                    className="h-16 w-16 shrink-0 border border-neon-foreground/30 object-cover sm:h-20 sm:w-20"
                  />
                ) : (
                  <div className="grid h-16 w-16 shrink-0 place-items-center border border-neon-foreground/30 bg-background sm:h-20 sm:w-20">
                    <ListMusic className="h-6 w-6 text-neon-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-neon-foreground/80">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neon-foreground align-middle" />
                    Tocando Agora
                  </p>
                  <Marquee
                    className="font-display text-lg font-bold tracking-tight sm:text-xl"
                    speed={26}
                  >
                    {playing.title}
                  </Marquee>
                  <p className="mt-1 truncate text-xs font-medium text-neon-foreground/70">
                    {playing.artist ?? playing.source} · enviado por {playing.submitter_name}
                  </p>
                </div>
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
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => toggleTop(playing)}
                  title={playing.is_top ? "Remover do Top" : "Fixar no Top da Fila"}
                  className={`inline-flex items-center gap-1 border px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest transition hover:opacity-90 ${
                    playing.is_top
                      ? "border-neon-foreground bg-neon-foreground text-neon"
                      : "border-neon-foreground/40 bg-transparent text-neon-foreground hover:bg-neon-foreground/10"
                  }`}
                >
                  <Star className={`h-3 w-3 ${playing.is_top ? "fill-current" : ""}`} />
                  {playing.is_top ? "No Top" : "Top"}
                </button>
                {!(progress && progress.duration > 0) && (
                  <button
                    onClick={() => finishAndPlayNext(playing.id, "played")}
                    className="border border-neon-foreground bg-neon-foreground px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-neon transition hover:opacity-90"
                  >
                    Tocada
                  </button>
                )}
                <button
                  onClick={() => finishAndPlayNext(playing.id, "skipped")}
                  className="border border-neon-foreground/40 bg-transparent px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-neon-foreground transition hover:bg-neon-foreground/10"
                >
                  Pular
                </button>
              </div>
              <OwnerPlayer
                item={playing}
                onEnded={() => finishAndPlayNext(playing.id, "played")}
                onProgress={(nextProgress) => handlePlayerProgress(playing, nextProgress)}
              />
            </div>
          ) : (
            <div className="app-card border-dashed p-6 text-center text-sm text-muted-foreground">
              Aguardando primeira música — aperte ▶ no próximo item
            </div>
          )}

          {/* Próximas — sem header separado, igual ao público */}
          <div
            className={`space-y-2 transition-all duration-700 ${playingLeaving ? "opacity-40 blur-[2px]" : "opacity-100"}`}
          >
            {queue.length === 0 ? (
              <div className="app-card border-dashed p-7 text-center text-sm text-muted-foreground">
                Fila vazia · compartilhe o link da sala com seu chat
              </div>
            ) : (
              queue.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(item.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverId !== item.id) setDragOverId(item.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === item.id) setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const group = sortQueue(
                      items.filter((i) => i.status === "queued" && i.is_top === item.is_top),
                    );
                    handleDrop(item.id, group);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  className={`flex cursor-grab flex-col gap-3 rounded-xl border p-3 transition-all active:cursor-grabbing sm:flex-row sm:items-center ${
                    item.is_top
                      ? "border-neon/40 bg-neon/[0.04]"
                      : "border-border bg-surface/60 backdrop-blur-[1px]"
                  } ${dragId === item.id ? "opacity-40" : ""} ${dragOverId === item.id && dragId !== item.id ? "border-neon ring-1 ring-neon" : ""}`}
                  title="Arraste para reordenar"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    <span className="w-7 shrink-0 text-center font-display text-base font-bold tabular-nums text-muted-foreground/50">
                      {(idx + 1).toString().padStart(2, "0")}
                    </span>

                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt=""
                        className="h-12 w-12 shrink-0 border border-border object-cover"
                      />
                    ) : (
                      <div className="grid h-12 w-12 shrink-0 place-items-center border border-border bg-surface-2">
                        <ListMusic className="h-4 w-4 text-muted-foreground/60" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {item.is_top && (
                          <span className="inline-flex shrink-0 items-center gap-1 border border-neon/40 bg-neon/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-neon">
                            <Star className="h-2.5 w-2.5 fill-current" /> Top
                          </span>
                        )}
                        <Marquee className="min-w-0 flex-1 text-sm font-bold">{item.title}</Marquee>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <SourceBadge source={item.source} />
                        <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          {item.artist ? `${item.artist} · ` : ""}
                          {item.submitter_name}
                        </span>
                      </div>
                    </div>
                    {item.paid_amount_cents > 0 && (
                      <span className="skew-x-[-12deg] shrink-0 border border-neon bg-neon px-2 py-1 font-display text-[10px] font-bold text-neon-foreground">
                        <span className="inline-flex skew-x-[12deg] items-center gap-1 tabular-nums">
                          <Zap className="h-3 w-3" /> {formatCents(item.paid_amount_cents)}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1 border-t border-border pt-3 sm:border-0 sm:pt-0">
                    <div className="flex">
                      <button
                        onClick={() => moveItem(item, -1)}
                        title="Subir"
                        className="border border-border p-1.5 text-muted-foreground hover:border-neon hover:text-neon disabled:opacity-30"
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveItem(item, 1)}
                        title="Descer"
                        className="border border-l-0 border-border p-1.5 text-muted-foreground hover:border-neon hover:text-neon disabled:opacity-30"
                        disabled={idx === queue.length - 1}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => toggleTop(item)}
                      title={item.is_top ? "Remover do Top" : "Fixar no Top da Fila"}
                      className={`border border-border p-2 hover:border-neon ${
                        item.is_top ? "text-neon" : "text-muted-foreground hover:text-neon"
                      }`}
                    >
                      <Star className={`h-4 w-4 ${item.is_top ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={() => playNow(item.id)}
                      title="Tocar"
                      className="border border-border p-2 text-muted-foreground hover:border-neon hover:text-neon"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setStatus(item.id, "skipped")}
                      title="Pular"
                      className="border border-border p-2 text-muted-foreground hover:border-foreground hover:text-foreground"
                    >
                      <SkipForward className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(item.id)}
                      title="Remover"
                      className="border border-border p-2 text-muted-foreground hover:border-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {tab === "top" && (
          <section className="relative z-10 mt-8 space-y-3">
            <div className="flex items-center justify-between border-b border-neon/30 pb-2">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-neon">
                <Star className="h-3.5 w-3.5 fill-current" /> Top 10 da Sala
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-neon/70">
                {topItems.length.toString().padStart(2, "0")} / 10
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Arraste para reordenar as músicas em fila · a música tocando também conta no Top
            </p>
            {(() => {
              if (topItems.length === 0) {
                return (
                  <div className="app-card border-dashed p-7 text-center text-sm text-muted-foreground">
                    Nenhuma música no Top — clique na ★ de qualquer música da fila
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {topItems.map((item, idx) => {
                    const isPlayingTop = item.status === "playing";
                    const queuedIdx = topQueuedItems.findIndex((it) => it.id === item.id);
                    return (
                      <div
                        key={item.id}
                        draggable={!isPlayingTop}
                        onDragStart={(e) => {
                          if (isPlayingTop) return;
                          setDragId(item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (isPlayingTop) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dragOverId !== item.id) setDragOverId(item.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverId === item.id) setDragOverId(null);
                        }}
                        onDrop={(e) => {
                          if (isPlayingTop) return;
                          e.preventDefault();
                          handleDrop(item.id, topQueuedItems);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOverId(null);
                        }}
                        className={`flex items-center gap-3 rounded-xl border border-neon/40 bg-neon/[0.06] p-3 transition-all ${
                          isPlayingTop ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                        } ${dragId === item.id ? "opacity-40" : ""} ${
                          dragOverId === item.id && dragId !== item.id
                            ? "border-neon ring-1 ring-neon"
                            : ""
                        }`}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center border border-neon bg-neon/15 font-display text-sm font-bold tabular-nums text-neon">
                          {(idx + 1).toString().padStart(2, "0")}
                        </span>
                        {item.thumbnail_url ? (
                          <img
                            src={item.thumbnail_url}
                            alt=""
                            className="h-12 w-12 shrink-0 border border-neon/40 object-cover"
                          />
                        ) : (
                          <div className="grid h-12 w-12 shrink-0 place-items-center border border-neon/40 bg-surface-2">
                            <ListMusic className="h-4 w-4 text-neon/60" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            {isPlayingTop && (
                              <span className="inline-flex shrink-0 items-center gap-1 border border-neon/40 bg-neon/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-neon">
                                <Play className="h-2.5 w-2.5 fill-current" /> Tocando agora
                              </span>
                            )}
                            <Marquee className="min-w-0 flex-1 text-sm font-bold">
                              {item.title}
                            </Marquee>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <SourceBadge source={item.source} />
                            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              {item.artist ? `${item.artist} · ` : ""}
                              {item.submitter_name}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {!isPlayingTop && (
                            <>
                              <button
                                onClick={() => moveItem(item, -1)}
                                title="Subir"
                                disabled={queuedIdx <= 0}
                                className="border border-border p-1.5 text-muted-foreground hover:border-neon hover:text-neon disabled:opacity-30"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => moveItem(item, 1)}
                                title="Descer"
                                disabled={queuedIdx < 0 || queuedIdx === topQueuedItems.length - 1}
                                className="border border-l-0 border-border p-1.5 text-muted-foreground hover:border-neon hover:text-neon disabled:opacity-30"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => toggleTop(item)}
                            title="Remover do Top"
                            className="border border-border p-2 text-neon hover:border-destructive hover:text-destructive"
                          >
                            <Star className="h-4 w-4 fill-current" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        )}

        {tab === "history" && (
          <section className="relative z-10 mt-8">
            <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">
                🎶 Histórico
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {history.length.toString().padStart(2, "0")} TOCADAS
              </span>
            </div>
            {history.length === 0 ? (
              <div className="app-card border-dashed p-7 text-center text-sm text-muted-foreground">
                Nenhuma música tocada ainda
              </div>
            ) : (
              <>
                <div className="overflow-hidden border border-border">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-[40%]" />
                      <col className="w-[18%]" />
                      <col className="w-[12%]" />
                      <col className="w-[8%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead className="bg-surface-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Música</th>
                        <th className="px-3 py-2 text-left">Quem pediu</th>
                        <th className="px-3 py-2 text-right">Pago</th>
                        <th className="px-3 py-2 text-center">Nota</th>
                        <th className="px-3 py-2 text-right">Quando</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistory.map((h) => (
                        <tr key={h.id} className="border-t border-border bg-surface/40">
                          <td className="px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                              {h.thumbnail_url ? (
                                <img
                                  src={h.thumbnail_url}
                                  alt=""
                                  className="h-8 w-8 shrink-0 border border-border object-cover"
                                />
                              ) : (
                                <div className="h-8 w-8 shrink-0 border border-border bg-surface-2" />
                              )}
                              <div className="min-w-0 flex-1">
                                <Marquee className="font-bold">{h.title}</Marquee>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                            {h.submitter_name}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {h.paid_amount_cents > 0 ? (
                              <span className="text-neon">{formatCents(h.paid_amount_cents)}</span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-[11px] text-muted-foreground/50">
                            —
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            {h.played_at
                              ? new Date(h.played_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`inline-flex border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
                                h.status === "played"
                                  ? "border-neon/40 bg-neon/10 text-neon"
                                  : "border-border bg-surface-2 text-muted-foreground"
                              }`}
                            >
                              {h.status === "played" ? "Tocou" : "Pulada"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={historyPage}
                  totalItems={history.length}
                  onPageChange={setHistoryPage}
                />
              </>
            )}
          </section>
        )}

        {tab === "earnings" && (
          <section className="mt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <Wallet className="h-3 w-3" /> Ganhos desta sala
              </h2>
              <Link
                to="/withdrawals"
                className="font-mono text-[10px] uppercase tracking-widest text-neon hover:underline"
              >
                ir para saques →
              </Link>
            </div>

            {earningsLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

            {earnings && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="border border-border bg-surface/60 p-4">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Bruto
                    </div>
                    <div className="font-display text-2xl font-bold tabular-nums">
                      {formatCents(earnings.totals.gross)}
                    </div>
                  </div>
                  <div className="border border-neon/40 bg-neon/5 p-4">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Líquido (você)
                    </div>
                    <div className="font-display text-2xl font-bold tabular-nums text-neon">
                      {formatCents(earnings.totals.net)}
                    </div>
                  </div>
                  <div className="border border-border bg-surface/60 p-4">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Taxa plataforma
                    </div>
                    <div className="font-display text-2xl font-bold tabular-nums">
                      {formatCents(earnings.totals.commission)}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-black/40">
                      <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <th className="px-3 py-2">Quando</th>
                        <th className="px-3 py-2">Apoiador</th>
                        <th className="px-3 py-2">Música</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Bruto</th>
                        <th className="px-3 py-2 text-right">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedPayments.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                            Nenhum pagamento ainda
                          </td>
                        </tr>
                      )}
                      {pagedApprovedPayments.map((p) => {
                        const title = (p.song_payload?.title as string | undefined) ?? "—";
                        return (
                          <tr key={p.id} className="border-t border-border/60">
                            <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                              {new Date(p.paid_at ?? p.created_at).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-3 py-2">{p.payer_name}</td>
                            <td className="px-3 py-2 truncate">{title}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`font-mono text-[10px] uppercase ${
                                  p.status === "approved"
                                    ? "text-neon"
                                    : p.status === "pending"
                                      ? "text-yellow-400"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatCents(p.amount_cents)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-neon">
                              {formatCents(p.net_cents)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={earningsPage}
                  totalItems={approvedPayments.length}
                  onPageChange={setEarningsPage}
                />
              </>
            )}
          </section>
        )}
      </AppShell>
      <Dialog
        open={spotifyTipsOpen}
        onOpenChange={(open) => {
          if (!open) closeSpotifyTips();
          else setSpotifyTipsOpen(true);
        }}
      >
        <DialogContent className="bg-surface border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold italic uppercase tracking-tighter">
              Dicas para tocar Spotify completo
            </DialogTitle>
            <DialogDescription>
              O SongPIX usa o player oficial do Spotify. Para evitar preview curto, prepare o
              navegador antes de iniciar a live.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <div className="flex gap-3 border border-border bg-background/40 p-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center bg-neon text-neon-foreground">
                <ExternalLink className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-xs font-bold uppercase tracking-widest">
                  Faça login no Spotify
                </h3>
                <p className="text-sm text-muted-foreground">
                  Abra o{" "}
                  <a
                    href="https://open.spotify.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-neon underline-offset-4 hover:underline"
                  >
                    Spotify
                  </a>{" "}
                  no mesmo navegador e entre na sua conta normal. Com a conta ativa, as músicas do
                  Spotify podem tocar completas no player oficial, em vez de ficarem limitadas ao
                  preview.
                </p>
              </div>
            </div>

            <div className="flex gap-3 border border-border bg-background/40 p-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center bg-neon text-neon-foreground">
                <Play className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-xs font-bold uppercase tracking-widest">
                  Deixe esta tela aberta
                </h3>
                <p className="text-sm text-muted-foreground">
                  Durante a live, mantenha o painel da sala aberto e clique no play da primeira
                  música. Depois disso, o SongPIX consegue avançar pela fila automaticamente quando
                  o player informar que a música terminou.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={closeSpotifyTips}
              className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Entendi
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {overlayOpen && <OverlayBuilder slug={slug} onClose={() => setOverlayOpen(false)} />}
    </>
  );
}

type OverlayWidget = {
  key: "now" | "music" | "request" | "request-qr" | "boosts" | "supporter" | "alert";
  label: string;
  desc: string;
  width: number;
  height: number;
};
const OVERLAY_WIDGETS: OverlayWidget[] = [
  {
    key: "alert",
    label: "🔔 Alerta de apoio (com som)",
    desc: "Pop-up animado com som quando alguém envia um novo apoio. Mantenha o áudio da fonte do navegador ativo.",
    width: 480,
    height: 160,
  },
  {
    key: "now",
    label: "Apenas música atual",
    desc: "Só o card 'No Ar' com capa, título e equalizer.",
    width: 480,
    height: 200,
  },
  {
    key: "music",
    label: "Música (Tocando + Fila)",
    desc: "Card no ar + fila com até 6 músicas e contador.",
    width: 480,
    height: 720,
  },
  {
    key: "request-qr",
    label: "Peça sua música + QR",
    desc: "Link destacado, QR Code central e chamada animada para sua transmissão.",
    width: 360,
    height: 450,
  },
  {
    key: "boosts",
    label: "Top fura filas",
    desc: "Top 5 apoios por valor.",
    width: 360,
    height: 480,
  },
];

function OverlayBuilder({ slug, onClose }: { slug: string; onClose: () => void }) {
  const sendOverlayAlertTest = useServerFn(triggerOverlayAlertTest);
  useBodyScrollLock();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [transparent, setTransparent] = useState(true);

  function urlFor(key: string) {
    const q = transparent ? `?w=${key}&bg=transparent` : `?w=${key}`;
    return `${origin}/overlay/${slug}${q}`;
  }

  function previewUrlFor(key: string) {
    return `${origin}/overlay/${slug}?w=${key}&bg=transparent&preview=1`;
  }

  function copyOne(key: string) {
    navigator.clipboard.writeText(urlFor(key));
    toast.success("URL copiada — cole no seu software de transmissão como fonte do navegador");
  }

  async function sendAlertTest() {
    try {
      const result = await sendOverlayAlertTest({ data: { roomSlug: slug } });
      const localSent = dispatchOverlayAlertTest(result.message);
      toast.success(
        localSent
          ? "Teste enviado para o overlay e para a pre-visualizacao local."
          : "Teste enviado para o overlay.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel enviar o teste");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-1rem)] w-full max-w-5xl overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-4 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-neon" />
            <h2 className="text-base font-semibold">Widgets</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Use as dimensões indicadas no seu software de transmissão
        </p>
        <label className="mb-4 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
            className="h-4 w-4 accent-neon"
          />
          <span className="text-sm font-medium">Fundo transparente</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            Recomendado para transmissão
          </span>
        </label>
        <div className="columns-1 gap-4 lg:columns-2">
          {OVERLAY_WIDGETS.map((w) => (
            <div
              key={w.key}
              className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-border bg-surface"
            >
              <div
                className="relative w-full overflow-hidden border-b border-border bg-[linear-gradient(45deg,#151515_25%,transparent_25%),linear-gradient(-45deg,#151515_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#151515_75%),linear-gradient(-45deg,transparent_75%,#151515_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
                style={{ aspectRatio: `${w.width} / ${w.height}` }}
              >
                <iframe
                  src={previewUrlFor(w.key)}
                  title={`Prévia do overlay ${w.label}`}
                  loading="lazy"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full border-0"
                />
              </div>

              <div className="space-y-3 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-neon" />
                      <span className="text-sm font-semibold">{w.label}</span>
                      <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {w.width} × {w.height}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{w.desc}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {w.key === "alert" && (
                      <button
                        onClick={sendAlertTest}
                        className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-neon hover:text-neon"
                      >
                        <BellRing className="h-3 w-3" /> Testar
                      </button>
                    )}
                    <a
                      href={urlFor(w.key)}
                      target="_blank"
                      rel="noreferrer"
                      title="Pré-visualizar"
                      className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-neon hover:text-neon"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      onClick={() => copyOne(w.key)}
                      className="inline-flex items-center gap-1 border border-neon bg-neon px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-neon-foreground hover:opacity-90"
                    >
                      <Copy className="h-3 w-3" /> Copiar
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto border border-dashed border-border bg-surface-2 p-2">
                  <div className="w-max min-w-full whitespace-nowrap font-mono text-[10px] text-neon">
                    {urlFor(w.key)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
