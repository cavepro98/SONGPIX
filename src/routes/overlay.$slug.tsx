import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Music, Zap, Heart, Star, Sparkles } from "lucide-react";
import { SourceBadge } from "@/components/SourceBadge";
import { Marquee } from "@/components/Marquee";
import { useAnimatedSwap } from "@/hooks/use-animated-swap";
import {
  OVERLAY_ALERT_TEST_CHANNEL,
  OVERLAY_ALERT_TEST_STORAGE_KEY,
  coerceOverlayAlertTestMessage,
  parseOverlayAlertTestMessage,
  type OverlayAlertTestMessage,
} from "@/lib/overlay-alert-test";

export const Route = createFileRoute("/overlay/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `Overlay | ${params.slug} · SongPIX` }],
    links: [
      {
        rel: "preload",
        href: "/sounds/castle-notification-443065.mp3",
        as: "audio",
        type: "audio/mpeg",
      },
    ],
  }),
  component: Overlay,
});

type Room = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  min_boost_cents: number;
  require_payment: boolean;
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
  played_at: string | null;
  duration_sec: number | null;
  is_top: boolean;
  manual_order: number | null;
};

const ALL_WIDGETS = [
  "now",
  "music",
  "request",
  "request-qr",
  "boosts",
  "supporter",
  "alert",
] as const;
type WidgetKey = (typeof ALL_WIDGETS)[number];

type AlertPayload = {
  id: string;
  name: string;
  title: string;
  amountCents: number;
  thumb: string | null;
};

type PlayerProgressPayload = {
  itemId: string;
  currentTime: number;
  duration: number;
};

type PublicRoomResponse = {
  room: Room;
  items: QueueItem[];
  history: QueueItem[];
};

async function fetchPublicRoom(slug: string): Promise<PublicRoomResponse | null> {
  const response = await fetch(`/api/public/rooms/${encodeURIComponent(slug)}`);
  if (!response.ok) return null;
  return (await response.json()) as PublicRoomResponse;
}

const ALERT_DISPLAY_MS = 4200;
const ALERT_EXIT_MS = 900;

const PREVIEW_ITEMS: QueueItem[] = [
  {
    id: "preview-playing",
    title: "A música que está tocando agora",
    artist: "Artista da live",
    thumbnail_url: null,
    source: "spotify",
    submitter_name: "@mateuslive",
    paid_amount_cents: 1200,
    status: "playing",
    created_at: "2026-08-15T00:00:00.000Z",
    played_at: null,
    duration_sec: 237,
    is_top: true,
    manual_order: null,
  },
  {
    id: "preview-queued-1",
    title: "Primeiro pedido da fila",
    artist: "Artista convidado",
    thumbnail_url: null,
    source: "youtube",
    submitter_name: "@apoiador",
    paid_amount_cents: 1000,
    status: "queued",
    created_at: "2026-08-15T00:01:00.000Z",
    played_at: null,
    duration_sec: 213,
    is_top: false,
    manual_order: null,
  },
  {
    id: "preview-queued-2",
    title: "Mais uma música pedida na live",
    artist: "Outro artista",
    thumbnail_url: null,
    source: "soundcloud",
    submitter_name: "@visitante",
    paid_amount_cents: 600,
    status: "queued",
    created_at: "2026-08-15T00:02:00.000Z",
    played_at: null,
    duration_sec: 284,
    is_top: false,
    manual_order: null,
  },
];

const PREVIEW_HISTORY: QueueItem[] = [
  {
    ...PREVIEW_ITEMS[1]!,
    id: "preview-history",
    title: "Pedido anterior da transmissão",
    submitter_name: "@ultimoapoio",
    paid_amount_cents: 800,
    status: "played",
    created_at: "2026-08-14T23:55:00.000Z",
    played_at: "2026-08-15T00:00:00.000Z",
  },
];

const PREVIEW_ALERT: AlertPayload = {
  id: "preview-alert",
  name: "@novoapoiador",
  title: "Pedido especial da live",
  amountCents: 1500,
  thumb: null,
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

function fmt(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(totalSeconds: number | null | undefined) {
  if (!totalSeconds || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return "--:--";
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const time = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : time;
}

function NowPlayingTime({ currentTime, duration }: { currentTime: number; duration: number }) {
  const remainingTime =
    duration > 0 ? `-${formatDuration(Math.max(0, duration - currentTime))}` : "--:--";

  return (
    <div className="absolute right-0 top-0 z-20 whitespace-nowrap font-mono text-[10px] font-bold tabular-nums tracking-wider">
      <span className="bg-background px-2 py-1 text-neon">{remainingTime}</span>
    </div>
  );
}

function Overlay() {
  const { slug } = Route.useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [playerProgress, setPlayerProgress] = useState<PlayerProgressPayload | null>(null);

  const widgets = useMemo<Set<WidgetKey>>(() => {
    if (typeof window === "undefined") return new Set(ALL_WIDGETS);
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("w") ?? params.get("widget") ?? "";
    if (!raw || raw === "all") return new Set(ALL_WIDGETS);
    const parts = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is WidgetKey => (ALL_WIDGETS as readonly string[]).includes(s));
    return parts.length ? new Set(parts) : new Set(ALL_WIDGETS);
  }, []);

  const transparent = useMemo(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    const v = (p.get("bg") ?? "").toLowerCase();
    return v === "transparent" || v === "0" || v === "none";
  }, []);

  const preview = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("preview") === "1";
  }, []);

  const show = (k: WidgetKey) => widgets.has(k);

  useEffect(() => {
    if (!transparent) return;
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, [transparent]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await fetchPublicRoom(slug);
      if (!mounted || !data) {
        setRoom(null);
        return;
      }
      setRoom(data.room);
      if (preview) {
        setItems(PREVIEW_ITEMS);
        setHistory(PREVIEW_HISTORY);
        return;
      }
      setItems(sortQueue(data.items));
      setHistory(data.history.slice(0, 10));
    })();
    return () => {
      mounted = false;
    };
  }, [preview, slug]);

  useEffect(() => {
    const roomId = room?.id;
    if (!roomId || preview) return;
    async function refetch() {
      const data = await fetchPublicRoom(slug);
      if (!data) {
        setRoom(null);
        return;
      }
      setRoom(data.room);
      setItems(sortQueue(data.items));
      setHistory(data.history.slice(0, 10));
    }
    const channel = supabase
      .channel(`room-${roomId}`)
      .on("broadcast", { event: "player-progress" }, ({ payload }) => {
        const next = payload as Partial<PlayerProgressPayload>;
        if (
          typeof next.itemId === "string" &&
          typeof next.currentTime === "number" &&
          typeof next.duration === "number"
        ) {
          setPlayerProgress(next as PlayerProgressPayload);
        }
      })
      .subscribe();
    const refreshTimer = window.setInterval(refetch, 5_000);
    return () => {
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [preview, room?.id, slug]);

  useEffect(() => {
    const playingId = items.find((item) => item.status === "playing")?.id;
    setPlayerProgress((current) => (current && current.itemId === playingId ? current : null));
  }, [items]);

  const widgetsKey = useMemo(() => ALL_WIDGETS.filter((w) => widgets.has(w)), [widgets]);
  const onlyAlert = widgetsKey.length === 1 && widgetsKey[0] === "alert";
  const refWidth =
    widgetsKey.length === 1
      ? (
          {
            now: 480,
            music: 480,
            request: 520,
            "request-qr": 360,
            supporter: 320,
            boosts: 360,
            alert: 480,
          } as const
        )[widgetsKey[0]!]
      : 640;
  const refHeight =
    widgetsKey.length === 1
      ? (
          {
            now: 200,
            music: 720,
            request: 230,
            "request-qr": 450,
            supporter: 360,
            boosts: 480,
            alert: 160,
          } as const
        )[widgetsKey[0]!]
      : 1080;

  const [scale, setScale] = useState(1);
  useEffect(() => {
    function update() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setScale(Math.max(0.2, Math.min(vw / refWidth, vh / refHeight)));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [refWidth, refHeight]);

  const livePlaying = items.find((i) => i.status === "playing") ?? null;
  const { displayed: playing, isLeaving: playingLeaving } = useAnimatedSwap(livePlaying);
  const displayedProgress =
    playing && playerProgress?.itemId === playing.id
      ? playerProgress
      : {
          itemId: playing?.id ?? "",
          currentTime: preview && playing ? 82 : 0,
          duration: playing?.duration_sec ?? 0,
        };

  // Alert queue: triggers a popup + sound when a new paid supporter shows up.
  const [alertQueue, setAlertQueue] = useState<AlertPayload[]>([]);
  const [activeAlert, setActiveAlert] = useState<AlertPayload | null>(null);
  const seenPaidRef = useRef<Map<string, number>>(new Map());
  const initializedRef = useRef(false);
  const lastOverlayTestTsRef = useRef(0);
  const showAlert = widgets.has("alert");
  const { displayed: displayedAlert, isLeaving: alertLeaving } = useAnimatedSwap(
    activeAlert,
    ALERT_EXIT_MS,
  );

  useEffect(() => {
    if (!showAlert || !room || preview || typeof window === "undefined") return;

    function enqueueTestAlert(message: OverlayAlertTestMessage | null) {
      if (!message) return;
      if (message.type !== "overlay-alert-test" || message.slug !== slug) return;
      if (message.ts <= lastOverlayTestTsRef.current) return;
      lastOverlayTestTsRef.current = message.ts;
      setAlertQueue((q) => [...q, message.alert]);
    }

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(OVERLAY_ALERT_TEST_CHANNEL);
      channel.onmessage = (event: MessageEvent<OverlayAlertTestMessage>) => {
        if (event.data) enqueueTestAlert(event.data);
      };
    }

    const eventsChannel = supabase
      .channel(`overlay-events-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "overlay_test_events",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const next = coerceOverlayAlertTestMessage(
            (payload.new as { payload?: unknown } | null)?.payload ?? null,
          );
          enqueueTestAlert(next);
        },
      )
      .subscribe();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== OVERLAY_ALERT_TEST_STORAGE_KEY || !event.newValue) return;
      enqueueTestAlert(parseOverlayAlertTestMessage(event.newValue));
    };

    const poll = window.setInterval(() => {
      enqueueTestAlert(
        parseOverlayAlertTestMessage(window.localStorage.getItem(OVERLAY_ALERT_TEST_STORAGE_KEY)),
      );
    }, 1200);

    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("storage", onStorage);
      channel?.close();
      supabase.removeChannel(eventsChannel);
    };
  }, [preview, room, showAlert, slug]);

  useEffect(() => {
    if (preview) return;
    const seen = seenPaidRef.current;
    const newAlerts: AlertPayload[] = [];
    for (const it of items) {
      if (it.paid_amount_cents <= 0) continue;
      const prev = seen.get(it.id) ?? 0;
      if (it.paid_amount_cents > prev) {
        if (initializedRef.current) {
          newAlerts.push({
            id: `${it.id}-${it.paid_amount_cents}`,
            name: it.submitter_name,
            title: it.title,
            amountCents: it.paid_amount_cents - prev,
            thumb: it.thumbnail_url,
          });
        }
        seen.set(it.id, it.paid_amount_cents);
      }
    }
    initializedRef.current = true;
    if (newAlerts.length && showAlert) {
      setAlertQueue((q) => [...q, ...newAlerts]);
    }
  }, [items, preview, showAlert]);

  useEffect(() => {
    if (preview || activeAlert || alertLeaving || alertQueue.length === 0) return;
    const next = alertQueue[0]!;
    setActiveAlert(next);
    setAlertQueue((q) => q.slice(1));
    playSupporterNotificationSound();
  }, [activeAlert, alertLeaving, alertQueue, preview]);

  useEffect(() => {
    if (!activeAlert || preview) return;
    const t = window.setTimeout(() => setActiveAlert(null), ALERT_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [activeAlert, preview]);

  if (!room) {
    return <div className="min-h-screen bg-transparent" />;
  }

  const queued = items.filter((i) => i.status === "queued");
  const next = queued[0] ?? null;
  const queueDisplay = queued.slice(0, 5);

  const boosts = [...items, ...history]
    .filter((i) => i.paid_amount_cents > 0)
    .sort((a, b) => b.paid_amount_cents - a.paid_amount_cents)
    .slice(0, 5);

  const lastSupporter =
    [...items, ...history]
      .filter((i) => i.paid_amount_cents > 0)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const alertToRender = preview && showAlert ? PREVIEW_ALERT : displayedAlert;

  const publicOrigin =
    typeof window !== "undefined" ? window.location.origin.replace("://www.", "://") : "";
  const publicUrl = publicOrigin ? `${publicOrigin}/${slug}` : `/${slug}`;
  const publicUrlLabel = publicUrl.replace(/^https?:\/\//, "");
  const requestTitle = room.require_payment ? "Peça sua música via PIX" : "Peça sua música grátis";
  const requestSubtitle = room.require_payment ? "donate da live" : "link direto da sala";
  const qrSubtitle = room.require_payment ? "escaneie e apoie" : "escaneie ou digite";

  return (
    <div
      data-transparent={transparent ? "1" : "0"}
      className="fixed inset-0 overflow-hidden bg-transparent font-sans text-foreground"
    >
      <div
        className="origin-top-left"
        style={{
          width: refWidth,
          height: refHeight,
          transform: `scale(${scale})`,
        }}
      >
        <div
          className={`grid gap-3 ${onlyAlert ? "overflow-visible p-0" : "overflow-hidden p-2"}`}
          style={{ width: refWidth, height: refHeight }}
        >
          {show("now") && (
            <WidgetCard
              label={room.name}
              icon={null}
              labelClassName="font-display text-sm font-extrabold italic normal-case tracking-normal text-foreground"
            >
              {playing ? (
                <div
                  key={playing.id}
                  className={`relative flex items-center gap-4 overflow-hidden bg-neon p-4 text-neon-foreground [--marquee-fade:var(--neon)] ${playingLeaving ? "animate-[soft-out_0.9s_cubic-bezier(0.4,0,0.2,1)_both]" : "animate-[soft-in_1.4s_cubic-bezier(0.22,1,0.36,1)_both]"}`}
                >
                  {playing.thumbnail_url ? (
                    <img
                      src={playing.thumbnail_url}
                      alt=""
                      className="h-20 w-20 shrink-0 border border-neon-foreground/30 object-cover"
                    />
                  ) : (
                    <div className="grid h-20 w-20 shrink-0 place-items-center border border-neon-foreground/30 bg-background/30">
                      <Music className="h-6 w-6" />
                    </div>
                  )}
                  <div className="relative z-10 min-w-0 flex-1">
                    <p className="mb-1 min-w-0 truncate pr-28 font-mono text-[10px] font-bold uppercase tracking-widest text-neon-foreground/80">
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neon-foreground align-middle" />
                      Tocando Agora
                    </p>
                    <Marquee className="font-display text-xl font-bold tracking-tight" speed={26}>
                      {playing.title}
                    </Marquee>
                    <p className="mt-1 truncate text-xs font-medium text-neon-foreground/70">
                      {playing.artist ?? playing.source} · enviado por {playing.submitter_name}
                    </p>
                  </div>
                  <NowPlayingTime
                    currentTime={displayedProgress.currentTime}
                    duration={displayedProgress.duration}
                  />
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
                <RequestMusicEmptyState publicUrlLabel={publicUrlLabel} compact />
              )}
            </WidgetCard>
          )}

          {show("music") && (
            <WidgetCard
              label={`Tocando agora · Fila (${queued.length})`}
              icon={<Music className="h-3 w-3" />}
            >
              <div className="space-y-3">
                <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 pb-3">
                  <div className="min-w-0 flex-1">
                    <Marquee className="font-display text-2xl font-extrabold italic uppercase tracking-tight text-foreground">
                      {room.name}
                    </Marquee>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-neon shadow-[0_0_10px_var(--neon)]" />
                      <span className="font-display text-xs font-bold uppercase tracking-widest">
                        Sinal Online
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      FURA FILA MÍN:&nbsp;{fmt(room.min_boost_cents)}
                    </span>
                  </div>
                </header>
                {playing ? (
                  <div
                    key={playing.id}
                    className={`relative flex items-center gap-4 overflow-hidden bg-neon p-4 text-neon-foreground [--marquee-fade:var(--neon)] ${playingLeaving ? "animate-[soft-out_0.9s_cubic-bezier(0.4,0,0.2,1)_both]" : "animate-[soft-in_1.4s_cubic-bezier(0.22,1,0.36,1)_both]"}`}
                  >
                    {playing.thumbnail_url ? (
                      <img
                        src={playing.thumbnail_url}
                        alt=""
                        className="h-20 w-20 shrink-0 border border-neon-foreground/30 object-cover"
                      />
                    ) : (
                      <div className="grid h-20 w-20 shrink-0 place-items-center border border-neon-foreground/30 bg-background/30">
                        <Music className="h-6 w-6" />
                      </div>
                    )}
                    <div className="relative z-10 min-w-0 flex-1">
                      <p className="mb-1 min-w-0 truncate pr-28 font-mono text-[10px] font-bold uppercase tracking-widest text-neon-foreground/80">
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neon-foreground align-middle" />
                        Tocando Agora
                      </p>
                      <Marquee className="font-display text-xl font-bold tracking-tight" speed={26}>
                        {playing.title}
                      </Marquee>
                      <p className="mt-1 truncate text-xs font-medium text-neon-foreground/70">
                        {playing.artist ?? playing.source} · enviado por {playing.submitter_name}
                      </p>
                    </div>
                    <NowPlayingTime
                      currentTime={displayedProgress.currentTime}
                      duration={displayedProgress.duration}
                    />
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
                  <RequestMusicEmptyState publicUrlLabel={publicUrlLabel} />
                )}

                {queueDisplay.length > 0 && (
                  <ol
                    className={`space-y-2 transition-all duration-700 ${playingLeaving ? "opacity-40 blur-[2px]" : "opacity-100"}`}
                  >
                    {queueDisplay.map((item, idx) => (
                      <li
                        key={item.id}
                        className={`flex items-center gap-3 border p-3 animate-[soft-in_0.9s_cubic-bezier(0.22,1,0.36,1)_both] ${
                          item.is_top
                            ? "border-neon/40 bg-neon/[0.06]"
                            : "border-border bg-black/40"
                        }`}
                      >
                        <span className="w-8 shrink-0 text-center font-display text-2xl font-bold tabular-nums text-muted-foreground/40">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <Thumb item={item} size="md" />
                        <div className="min-w-0 flex-1">
                          {item.is_top && (
                            <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-widest text-neon">
                              <Star className="h-2.5 w-2.5 fill-current" /> Top
                            </span>
                          )}
                          <Marquee className="text-base font-bold">{item.title}</Marquee>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <SourceBadge source={item.source} />
                            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              {item.submitter_name}
                            </span>
                          </div>
                        </div>
                        {item.paid_amount_cents > 0 && (
                          <div className="skew-x-[-12deg] shrink-0 border border-neon bg-neon px-2 py-1 font-display text-[10px] font-black text-neon-foreground">
                            <span className="inline-block skew-x-[12deg] tabular-nums">
                              {fmt(item.paid_amount_cents)}
                            </span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {queued.length > queueDisplay.length && (
                  <div className="border-t border-border pt-2 text-center font-mono text-[11px] font-bold uppercase tracking-widest text-neon">
                    + {queued.length - queueDisplay.length} música
                    {queued.length - queueDisplay.length > 1 ? "s" : ""} na fila
                  </div>
                )}
              </div>
            </WidgetCard>
          )}

          {show("request") && (
            <WidgetCard label={requestTitle} icon={<Zap className="h-3 w-3" />}>
              <div className="relative overflow-hidden border border-neon/30 bg-neon/[0.06] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]">
                <div className="absolute right-0 top-0 border-l border-b border-neon/30 bg-neon px-2 py-1 font-display text-[8px] font-black uppercase tracking-[0.18em] text-neon-foreground">
                  ao vivo
                </div>
                <div className="space-y-2 pr-14">
                  <div className="font-display text-[26px] font-black italic uppercase leading-[0.92] tracking-tight text-foreground">
                    {requestTitle}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    {requestSubtitle}
                  </div>
                  <div className="truncate font-display text-base font-bold uppercase text-neon">
                    {room.slug}
                  </div>
                  <div className="truncate border-t border-border/70 pt-2 font-mono text-[11px] text-neon">
                    {publicUrlLabel}
                  </div>
                </div>
              </div>
            </WidgetCard>
          )}

          {show("request-qr") && (
            <WidgetCard
              label={room.name}
              icon={<Zap className="h-3 w-3" />}
              labelClassName="font-display text-xs font-extrabold italic normal-case tracking-normal text-foreground"
            >
              <div className="relative flex aspect-[4/5] min-h-[382px] flex-col items-center overflow-hidden bg-neon p-5 text-center text-neon-foreground">
                <div className="w-full bg-neon-foreground px-3 py-2 text-neon shadow-[5px_5px_0_rgba(0,0,0,0.35)]">
                  <div className="font-mono text-[8px] font-black uppercase tracking-[0.24em] opacity-70">
                    acesse ou escaneie
                  </div>
                  <div className="truncate font-mono text-[13px] font-black tracking-tight">
                    {publicUrlLabel}
                  </div>
                </div>

                <div className="my-auto grid place-items-center py-3">
                  <div className="relative grid h-[194px] w-[194px] place-items-center bg-white p-4 shadow-[8px_8px_0_rgba(0,0,0,0.35)]">
                    <QRCodeSVG value={publicUrl} size={146} level="M" />
                    <span className="absolute -left-1 -top-1 h-7 w-7 border-l-4 border-t-4 border-neon-foreground" />
                    <span className="absolute -bottom-1 -right-1 h-7 w-7 border-b-4 border-r-4 border-neon-foreground" />
                  </div>
                </div>

                <div className="w-full">
                  <div className="font-display text-[45px] font-black italic uppercase leading-[0.8] tracking-[-0.08em] animate-[qr-title_2.8s_ease-in-out_infinite]">
                    <span className="block">Peça sua</span>
                    <span className="block text-neon-foreground/75">música</span>
                  </div>
                  <div className="mt-3 font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-neon-foreground/70">
                    {qrSubtitle}
                    {room.require_payment ? " · via PIX" : " · envio grátis"}
                  </div>
                </div>
              </div>
            </WidgetCard>
          )}

          {show("supporter") && (
            <WidgetCard label="Último apoiador" icon={<Heart className="h-3 w-3" />}>
              {lastSupporter ? (
                <div>
                  <div className="font-display text-xl font-black uppercase text-neon">
                    {lastSupporter.submitter_name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    apoiou com{" "}
                    <span className="font-bold text-foreground">
                      {fmt(lastSupporter.paid_amount_cents)}
                    </span>
                  </div>
                  <Marquee className="mt-1 text-[11px] text-muted-foreground/70">
                    {lastSupporter.title}
                  </Marquee>
                </div>
              ) : (
                <EmptyLine text="Sem apoios ainda" />
              )}
            </WidgetCard>
          )}

          {show("boosts") && (
            <WidgetCard label="Top fura filas" icon={<Zap className="h-3 w-3" />}>
              {boosts.length ? (
                <ul className="space-y-1.5">
                  {boosts.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-1">
                        <span className="font-bold text-foreground">{b.submitter_name}</span>{" "}
                        <Marquee className="text-muted-foreground">· {b.title}</Marquee>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] font-bold text-neon">
                        {fmt(b.paid_amount_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyLine text="Sem fura filas" />
              )}
            </WidgetCard>
          )}

          {show("alert") && alertToRender && (
            <SupporterAlertCard alert={alertToRender} leaving={preview ? false : alertLeaving} />
          )}
        </div>
      </div>
    </div>
  );
}

function SupporterAlertCard({ alert, leaving }: { alert: AlertPayload; leaving: boolean }) {
  return (
    <div
      className={`relative overflow-hidden border border-neon/40 bg-neon text-neon-foreground [--marquee-fade:var(--neon)] ${
        leaving
          ? "animate-[soft-out_0.9s_cubic-bezier(0.4,0,0.2,1)_both]"
          : "animate-[soft-in_1.1s_cubic-bezier(0.22,1,0.36,1)_both]"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:repeating-linear-gradient(45deg,transparent_0_10px,rgba(0,0,0,0.08)_10px_20px)] animate-[alert-stripes_1.2s_linear_infinite]" />
      <div className="relative flex min-h-[136px] items-center gap-3 p-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center border border-neon-foreground/40 bg-neon-foreground/10 animate-[alert-pop_0.9s_ease-out_both]">
          {alert.thumb ? (
            <img src={alert.thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <Sparkles className="h-7 w-7" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-neon-foreground/80">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neon-foreground align-middle" />
            Novo apoio
          </p>
          <Marquee
            className="font-display text-xl font-extrabold italic uppercase leading-tight tracking-tight"
            speed={45}
          >
            {alert.name}
          </Marquee>
          <Marquee className="text-xs font-medium text-neon-foreground/80" speed={40}>
            apoiou: {alert.title}
          </Marquee>
        </div>
        <div className="shrink-0 skew-x-[-12deg] border border-neon-foreground bg-neon-foreground px-3 py-2 font-display text-base font-black text-neon animate-[alert-pop_0.9s_0.1s_ease-out_both]">
          <span className="inline-block skew-x-[12deg] tabular-nums">
            +
            {(alert.amountCents / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

function playSupporterNotificationSound() {
  if (typeof window === "undefined") return;
  const audio = new Audio("/sounds/castle-notification-443065.mp3");
  audio.preload = "auto";
  audio.volume = 0.9;
  void audio.play().catch(() => {
    // OBS must keep Browser Source audio enabled for notification sounds.
  });
}

function WidgetCard({
  label,
  icon,
  children,
  labelClassName,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <div className="widget-card min-w-0 max-w-full overflow-hidden bg-background/85 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2 pb-2 text-muted-foreground">
        {icon}
        <span
          className={`truncate text-[10px] font-bold uppercase tracking-widest ${labelClassName ?? "font-mono"}`}
        >
          {label}
        </span>
      </div>
      <div className="min-w-0 max-w-full overflow-hidden">{children}</div>
    </div>
  );
}

function Thumb({ item, size }: { item: QueueItem; size: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-20 w-20" : size === "md" ? "h-14 w-14" : "h-10 w-10";
  if (item.thumbnail_url) {
    return (
      <img
        src={item.thumbnail_url}
        alt=""
        className={`${cls} shrink-0 border border-border object-cover`}
      />
    );
  }
  return (
    <div className={`${cls} grid shrink-0 place-items-center border border-border bg-surface-2`}>
      <Music className="h-5 w-5 text-muted-foreground/60" />
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{text}</div>
  );
}

function RequestMusicEmptyState({
  publicUrlLabel,
  compact = false,
}: {
  publicUrlLabel: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex min-h-[88px] items-center justify-between gap-4 overflow-hidden px-1 py-2">
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Fila aberta
          </div>
          <div className="mt-1 font-display text-[32px] font-black italic uppercase leading-[0.86] tracking-[-0.07em] text-foreground">
            Peça sua música
          </div>
        </div>
        <div className="min-w-0 max-w-[230px] shrink-0 bg-neon px-3 py-2 text-right text-neon-foreground shadow-[4px_4px_0_rgba(0,0,0,0.45)]">
          <div className="font-mono text-[8px] font-black uppercase tracking-[0.22em] opacity-75">
            acesse
          </div>
          <div className="truncate font-mono text-[13px] font-black uppercase tracking-tight">
            {publicUrlLabel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[156px] overflow-hidden border border-neon/40 bg-neon p-5 text-neon-foreground [--marquee-fade:var(--neon)]">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.55),transparent_24%),repeating-linear-gradient(135deg,rgba(0,0,0,0.1)_0_10px,transparent_10px_22px)]" />
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full border border-neon-foreground/30 animate-[pulse_2.4s_ease-in-out_infinite]" />
      <div className="relative grid h-full gap-3">
        <div className="inline-flex w-fit items-center gap-2 border border-neon-foreground/35 bg-neon-foreground/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-neon-foreground/80">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-foreground" />
          fila aberta
        </div>
        <div>
          <div className="font-display text-[54px] font-black italic uppercase leading-[0.82] tracking-[-0.08em]">
            <span className="block">Peça sua</span>
            <span className="block text-neon-foreground/80">música</span>
          </div>
          <div className="mt-3 truncate bg-neon-foreground px-3 py-2 font-mono text-[12px] font-black uppercase tracking-tight text-neon">
            {publicUrlLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
