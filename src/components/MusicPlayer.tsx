import { useEffect, useRef } from "react";

type Progress = { currentTime: number; duration: number };

type Props = {
  url: string;
  source: string;
  onEnded?: () => void;
  onProgress?: (p: Progress) => void;
};

function ytId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/");
    const i = parts.findIndex((p) => p === "embed" || p === "shorts");
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
    return null;
  } catch {
    return null;
  }
}

function spotifyEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("spotify.com")) return null;
    const parts = u.pathname
      .split("/")
      .filter(Boolean)
      .filter((p) => !p.startsWith("intl-"));
    const types = ["track", "album", "playlist", "episode", "show", "artist"];
    const i = parts.findIndex((p) => types.includes(p));
    if (i < 0 || !parts[i + 1]) return null;
    const id = parts[i + 1].split("?")[0];
    return `https://open.spotify.com/embed/${parts[i]}/${id}`;
  } catch {
    return null;
  }
}

export function MusicPlayer({ url, source, onEnded, onProgress }: Props) {
  const src = source.toLowerCase();

  if (src === "youtube") {
    const id = ytId(url);
    if (!id) return <Fallback url={url} />;
    return <YouTubePlayer id={id} onEnded={onEnded} onProgress={onProgress} />;
  }

  if (src === "spotify") {
    const embed = spotifyEmbed(url);
    if (!embed) return <Fallback url={url} />;
    return <SpotifyPlayer embed={embed} onEnded={onEnded} onProgress={onProgress} />;
  }

  if (src === "soundcloud") {
    return <SoundCloudPlayer url={url} onEnded={onEnded} onProgress={onProgress} />;
  }

  if (src === "upload" || src === "audio" || src === "file") {
    return (
      <div className="border border-border bg-black p-3">
        <audio
          controls
          autoPlay
          preload="metadata"
          src={url}
          className="block h-12 w-full"
          onEnded={onEnded}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            if (a.duration) onProgress?.({ currentTime: a.currentTime, duration: a.duration });
          }}
          onLoadedMetadata={(e) => {
            const a = e.currentTarget;
            if (a.duration) onProgress?.({ currentTime: a.currentTime, duration: a.duration });
          }}
        />
      </div>
    );
  }

  return <Fallback url={url} />;
}

function YouTubePlayer({
  id,
  onEnded,
  onProgress,
}: {
  id: string;
  onEnded?: () => void;
  onProgress?: (p: Progress) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(onEnded);
  const progressRef = useRef(onProgress);
  endedRef.current = onEnded;
  progressRef.current = onProgress;

  useEffect(() => {
    let player: any = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    function loadApi(): Promise<any> {
      const w = window as any;
      if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
      if (!w.__ytApiPromise) {
        w.__ytApiPromise = new Promise((resolve) => {
          const prev = w.onYouTubeIframeAPIReady;
          w.onYouTubeIframeAPIReady = () => {
            prev?.();
            resolve(w.YT);
          };
          const tag = document.createElement("script");
          tag.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(tag);
        });
      }
      return w.__ytApiPromise;
    }

    loadApi().then((YT) => {
      if (cancelled || !containerRef.current) return;
      player = new YT.Player(containerRef.current, {
        videoId: id,
        playerVars: { autoplay: 1, playsinline: 1 },
        events: {
          onReady: (e: any) => {
            try {
              e.target.playVideo();
            } catch {
              /* ignore */
            }
          },
          onStateChange: (e: any) => {
            if (e.data === YT.PlayerState.ENDED) endedRef.current?.();
          },
        },
      });
      pollId = setInterval(() => {
        try {
          const ct = player?.getCurrentTime?.();
          const dur = player?.getDuration?.();
          if (typeof ct === "number" && typeof dur === "number" && dur > 0) {
            progressRef.current?.({ currentTime: ct, duration: dur });
          }
        } catch {
          /* ignore */
        }
      }, 500);
    });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [id]);

  return (
    <div className="aspect-video w-full overflow-hidden border border-border bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function SoundCloudPlayer({
  url,
  onEnded,
  onProgress,
}: {
  url: string;
  onEnded?: () => void;
  onProgress?: (p: Progress) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  useEffect(() => {
    let widget: {
      bind: (e: string, cb: () => void) => void;
      unbind: (e: string) => void;
      getPosition: (cb: (pos: number) => void) => void;
      getDuration: (cb: (dur: number) => void) => void;
    } | null = null;

    function ensureApi(): Promise<void> {
      return new Promise((resolve) => {
        const w = window as unknown as { SC?: { Widget: (el: HTMLIFrameElement) => unknown } };
        if (w.SC?.Widget) return resolve();
        const existing = document.querySelector<HTMLScriptElement>("script[data-sc-widget]");
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = "https://w.soundcloud.com/player/api.js";
        s.async = true;
        s.dataset.scWidget = "1";
        s.onload = () => resolve();
        document.head.appendChild(s);
      });
    }

    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;
    const progressRef = { current: onProgress };
    progressRef.current = onProgress;

    ensureApi().then(() => {
      if (cancelled || !iframeRef.current) return;
      const w = window as unknown as {
        SC: { Widget: ((el: HTMLIFrameElement) => typeof widget) & { Events: { FINISH: string } } };
      };
      widget = w.SC.Widget(iframeRef.current);
      widget?.bind(w.SC.Widget.Events.FINISH, () => endedRef.current?.());

      pollId = setInterval(() => {
        if (!widget) return;
        widget.getDuration((dur) => {
          if (!widget || !dur) return;
          widget.getPosition((pos) => {
            progressRef.current?.({ currentTime: pos / 1000, duration: dur / 1000 });
          });
        });
      }, 1000);
    });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      try {
        const w = window as unknown as { SC?: { Widget: { Events: { FINISH: string } } } };
        if (widget && w.SC?.Widget?.Events?.FINISH) widget.unbind(w.SC.Widget.Events.FINISH);
      } catch {
        /* ignore */
      }
    };
  }, [url]);

  return (
    <iframe
      ref={iframeRef}
      title="SoundCloud player"
      className="h-[166px] w-full border border-border bg-black"
      scrolling="no"
      allow="autoplay"
      src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&color=%2300ff9f`}
    />
  );
}

function SpotifyPlayer({
  embed,
  onEnded,
  onProgress,
}: {
  embed: string;
  onEnded?: () => void;
  onProgress?: (p: Progress) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  useEffect(() => {
    let controller: { destroy?: () => void } | null = null;
    let cancelled = false;
    let endedFired = false;
    const progressRef = { current: onProgress };
    progressRef.current = onProgress;

    function ensureApi(): Promise<void> {
      return new Promise((resolve) => {
        const w = window as unknown as {
          SpotifyIframeApi?: unknown;
          onSpotifyIframeApiReady?: (api: unknown) => void;
        };
        if (w.SpotifyIframeApi) return resolve();
        const existing = document.querySelector<HTMLScriptElement>("script[data-spotify-iframe]");
        const prev = w.onSpotifyIframeApiReady;
        w.onSpotifyIframeApiReady = (api: unknown) => {
          (window as unknown as { SpotifyIframeApi: unknown }).SpotifyIframeApi = api;
          prev?.(api);
          resolve();
        };
        if (existing) return;
        const s = document.createElement("script");
        s.src = "https://open.spotify.com/embed/iframe-api/v1";
        s.async = true;
        s.dataset.spotifyIframe = "1";
        document.head.appendChild(s);
      });
    }

    ensureApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const api = (
        window as unknown as {
          SpotifyIframeApi: {
            createController: (
              el: HTMLElement,
              opts: { uri?: string; width?: string | number; height?: string | number },
              cb: (c: {
                addListener: (
                  e: string,
                  fn: (d: {
                    data?: {
                      isPaused?: boolean;
                      isBuffering?: boolean;
                      position?: number;
                      duration?: number;
                    };
                  }) => void,
                ) => void;
                destroy?: () => void;
                play?: () => void;
              }) => void,
            ) => void;
          };
        }
      ).SpotifyIframeApi;

      const el = document.createElement("div");
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(el);

      const match = embed.match(/embed\/(\w+)\/([\w\d]+)/);
      const uri = match ? `spotify:${match[1]}:${match[2]}` : undefined;

      api.createController(el, { uri, width: "100%", height: 152 }, (c) => {
        controller = c;
        try {
          c.play?.();
        } catch {
          /* ignore */
        }
        c.addListener("playback_update", (e) => {
          const d = e?.data;
          if (!d) return;
          if (typeof d.duration === "number" && typeof d.position === "number" && d.duration > 0) {
            progressRef.current?.({ currentTime: d.position / 1000, duration: d.duration / 1000 });
          }
          if (endedFired) return;
          if (
            typeof d.duration === "number" &&
            typeof d.position === "number" &&
            d.duration > 0 &&
            d.position >= d.duration - 300
          ) {
            endedFired = true;
            endedRef.current?.();
          }
        });
      });
    });

    return () => {
      cancelled = true;
      try {
        controller?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [embed]);

  return <div ref={containerRef} className="min-h-[152px] w-full border border-border bg-black" />;
}

function Fallback({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block border border-border bg-surface-2 p-4 text-center text-sm text-muted-foreground hover:text-neon"
    >
      Abrir música ↗
    </a>
  );
}
