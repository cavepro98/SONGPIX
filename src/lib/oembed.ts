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
