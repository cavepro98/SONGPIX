export type TrackSource = "youtube" | "spotify" | "soundcloud";

export type TrackMetadata = {
  source: TrackSource;
  url: string;
  title: string;
  artist?: string;
  thumbnail_url?: string;
  duration_sec?: number;
};

export function detectSource(url: string): TrackSource | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host === "music.youtube.com"
    )
      return "youtube";
    if (host === "open.spotify.com" || host === "spotify.com") return "spotify";
    if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) return "soundcloud";
    return null;
  } catch {
    return null;
  }
}

export function isPlaylistUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.toLowerCase();

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host === "music.youtube.com"
    ) {
      return path.startsWith("/playlist") || u.searchParams.has("list");
    }

    if (host === "open.spotify.com" || host === "spotify.com") {
      return /^\/(?:intl-[a-z]{2}\/)?playlist\//.test(path);
    }

    if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) {
      return path.includes("/sets/");
    }

    return false;
  } catch {
    return false;
  }
}

export function isTrackUrl(url: string, source: TrackSource): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.toLowerCase();
    const parts = path.split("/").filter(Boolean);

    if (source === "youtube") {
      if (
        host !== "youtube.com" &&
        host !== "m.youtube.com" &&
        host !== "youtu.be" &&
        host !== "music.youtube.com"
      ) {
        return false;
      }
      if (host === "youtu.be") return parts.length === 1 && !!parts[0];
      return (
        (path === "/watch" && !!u.searchParams.get("v")) ||
        (parts[0] === "shorts" && parts.length === 2 && !!parts[1]) ||
        (parts[0] === "embed" && parts.length === 2 && !!parts[1])
      );
    }

    if (source === "spotify") {
      if (host !== "open.spotify.com" && host !== "spotify.com") return false;
      return /^\/(?:intl-[a-z]{2}\/)?track\/[a-z0-9]+/i.test(path);
    }

    if (source === "soundcloud") {
      if (host === "on.soundcloud.com") return true;
      if (host !== "soundcloud.com" && !host.endsWith(".soundcloud.com")) return false;
      if (path.includes("/sets/")) return false;
      return parts.length >= 2 && !["discover", "charts", "search", "you", "stream"].includes(parts[0]!);
    }

    return false;
  } catch {
    return false;
  }
}

export async function resolveSoundcloudShortUrl(url: string): Promise<string> {
  try {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./, "") !== "on.soundcloud.com") return url;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SongPIXBot/1.0; +https://songpix.app)",
        Accept: "text/html",
      },
    });
    const finalUrl = res.url;
    if (finalUrl && /soundcloud\.com\//.test(finalUrl) && !/on\.soundcloud\.com/.test(finalUrl)) {
      return finalUrl.split("?")[0]!;
    }
    return url;
  } catch {
    return url;
  }
}
