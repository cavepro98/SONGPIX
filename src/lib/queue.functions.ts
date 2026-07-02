import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  detectSource,
  isPlaylistUrl,
  isTrackUrl,
  resolveSoundcloudShortUrl,
  type TrackMetadata,
  type TrackSource,
} from "./oembed";
import { assertPublicAppAvailable } from "./app-config.server";
import { enforceRateLimit } from "./security.server";

const SubmitInput = z.object({
  roomSlug: z.string().min(1).max(64),
  url: z.string().url().max(2000),
  submitterName: z.string().trim().min(1).max(40),
});

const UploadTicketInput = z.object({
  roomSlug: z.string().min(1).max(64),
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  submitterName: z.string().trim().min(1).max(40),
});

const StorageUploadInput = z.object({
  roomSlug: z.string().min(1).max(64),
  storagePath: z.string().min(1).max(500),
  title: z.string().trim().min(1).max(120),
  submitterName: z.string().trim().min(1).max(40),
});

const ALLOWED_AUDIO_EXT = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "weba"];

function validateAudioUploadMeta(fileName: string, contentType: string) {
  if (!contentType.startsWith("audio/")) {
    throw new Error("Apenas arquivos de áudio são permitidos");
  }
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_AUDIO_EXT.includes(ext)) {
    throw new Error("Apenas arquivos de áudio são permitidos");
  }
  return { safeName, ext };
}

async function fetchSpotifyArtist(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SongPIXBot/1.0; +https://songpix.app)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    // <meta property="og:description" content="Song · Artist · 2020">
    const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (!m) return undefined;
    const parts = m[1]
      .split("·")
      .map((p) => p.trim())
      .filter(Boolean);
    // Typical track page: "Song · Single · Artist · 2020" — pick the part that is not "Song" / "Single" / a year
    const skip = /^(song|single|ep|album|playlist|podcast|episode)$/i;
    const year = /^\d{4}$/;
    const artist = parts.find((p) => !skip.test(p) && !year.test(p) && p.length < 80);
    return artist;
  } catch {
    return undefined;
  }
}

async function fetchMetadata(url: string, source: TrackSource): Promise<TrackMetadata> {
  let oembedUrl: string;
  if (source === "youtube") {
    oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  } else if (source === "soundcloud") {
    oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  } else {
    oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  }

  const res = await fetch(oembedUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Não conseguimos ler essa música. Confere o link?");
  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };
  if (!data.title) throw new Error("Música sem título — link inválido");
  let artist = data.author_name;
  if (source === "spotify") {
    const spotifyArtist = await fetchSpotifyArtist(url);
    if (spotifyArtist) artist = spotifyArtist;
  }
  return {
    source,
    url,
    title: data.title,
    artist,
    thumbnail_url: data.thumbnail_url,
  };
}

export const submitTrack = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitInput.parse(input))
  .handler(async ({ data }) => {
    enforceRateLimit({ bucket: "queue-submit-link", limit: 20, windowMs: 60_000 });
    await assertPublicAppAvailable();
    const source = detectSource(data.url);
    if (!source) throw new Error("Fonte não suportada. Use YouTube, Spotify ou SoundCloud.");
    if (isPlaylistUrl(data.url)) throw new Error("Playlist não é aceita. Envie o link de uma música.");
    const normalizedUrl =
      source === "soundcloud" ? await resolveSoundcloudShortUrl(data.url) : data.url;
    if (isPlaylistUrl(normalizedUrl))
      throw new Error("Playlist não é aceita. Envie o link de uma música.");
    if (!isTrackUrl(normalizedUrl, source))
      throw new Error("Envie apenas o link direto de uma música.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: room, error: roomErr } = await supabaseAdmin
      .from("rooms")
      .select(
        "id, is_open, allow_youtube, allow_spotify, allow_soundcloud, max_duration_sec, require_payment",
      )
      .eq("slug", data.roomSlug)
      .is("archived_at", null)
      .maybeSingle();
    if (roomErr) throw new Error(roomErr.message);
    if (!room) throw new Error("Sala não encontrada");
    if (!room.is_open) throw new Error("A fila está fechada");
    if (room.require_payment) throw new Error("Esta sala aceita apenas músicas pagas");
    if (source === "youtube" && !room.allow_youtube)
      throw new Error("YouTube não permitido nesta sala");
    if (source === "spotify" && !room.allow_spotify)
      throw new Error("Spotify não permitido nesta sala");
    if (source === "soundcloud" && !room.allow_soundcloud)
      throw new Error("SoundCloud não permitido nesta sala");

    const { data: dup } = await supabaseAdmin
      .from("queue_items")
      .select("id")
      .eq("room_id", room.id)
      .eq("url", normalizedUrl)
      .in("status", ["queued", "playing"])
      .maybeSingle();
    if (dup) throw new Error("Essa música já está na fila");

    const meta = await fetchMetadata(normalizedUrl, source);

    if (
      typeof meta.duration_sec === "number" &&
      meta.duration_sec > 0 &&
      room.max_duration_sec &&
      meta.duration_sec > room.max_duration_sec
    ) {
      const maxMin = Math.round(room.max_duration_sec / 60);
      throw new Error(`Música muito longa. Limite: ${maxMin} min`);
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("queue_items")
      .insert({
        room_id: room.id,
        source,
        url: meta.url,
        title: meta.title,
        artist: meta.artist ?? null,
        thumbnail_url: meta.thumbnail_url ?? null,
        duration_sec: meta.duration_sec ?? null,
        submitter_name: data.submitterName,
        status: "queued",
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return inserted;
  });

export const createUploadTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UploadTicketInput.parse(input))
  .handler(async ({ data }) => {
    enforceRateLimit({ bucket: "queue-upload-ticket", limit: 8, windowMs: 60_000 });
    await assertPublicAppAvailable();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: room, error: roomErr } = await supabaseAdmin
      .from("rooms")
      .select("id, is_open, allow_upload, require_payment")
      .eq("slug", data.roomSlug)
      .is("archived_at", null)
      .maybeSingle();
    if (roomErr) throw new Error(roomErr.message);
    if (!room) throw new Error("Sala não encontrada");
    if (!room.is_open) throw new Error("A fila está fechada");
    if (!room.allow_upload) throw new Error("Esta sala não aceita upload de arquivo");

    const { safeName } = validateAudioUploadMeta(data.fileName, data.contentType);
    const { data: dup } = await supabaseAdmin
      .from("queue_items")
      .select("id")
      .eq("room_id", room.id)
      .eq("title", data.title)
      .eq("source", "upload")
      .in("status", ["queued", "playing"])
      .maybeSingle();
    if (dup) throw new Error("Essa música já está na fila");

    const folder = room.require_payment ? "paid" : "direct";
    const storagePath = `${room.id}/${folder}/${Date.now()}-${safeName}`;
    const { data: ticket, error: ticketErr } = await supabaseAdmin.storage
      .from("song-uploads")
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (ticketErr) throw new Error(ticketErr.message);

    return {
      path: ticket.path,
      token: ticket.token,
      signedUrl: ticket.signedUrl,
      title: data.title,
      requiresPayment: Boolean(room.require_payment),
    };
  });

export const submitUploadedTrackFromStorage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StorageUploadInput.parse(input))
  .handler(async ({ data }) => {
    enforceRateLimit({ bucket: "queue-submit-storage-upload", limit: 8, windowMs: 60_000 });
    await assertPublicAppAvailable();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: room, error: roomErr } = await supabaseAdmin
      .from("rooms")
      .select("id, is_open, allow_upload, require_payment")
      .eq("slug", data.roomSlug)
      .is("archived_at", null)
      .maybeSingle();
    if (roomErr) throw new Error(roomErr.message);
    if (!room) throw new Error("Sala não encontrada");
    if (!room.is_open) throw new Error("A fila está fechada");
    if (room.require_payment) throw new Error("Esta sala aceita apenas músicas pagas");
    if (!room.allow_upload) throw new Error("Esta sala não aceita upload de arquivo");

    const safePrefix = `${room.id}/direct/`;
    if (
      !data.storagePath.startsWith(safePrefix) ||
      data.storagePath.includes("..") ||
      data.storagePath.includes("//")
    ) {
      throw new Error("Arquivo inválido");
    }

    const { error: signedErr } = await supabaseAdmin.storage
      .from("song-uploads")
      .createSignedUrl(data.storagePath, 60);
    if (signedErr) throw new Error("Arquivo não encontrado");

    const { data: dup } = await supabaseAdmin
      .from("queue_items")
      .select("id")
      .eq("room_id", room.id)
      .eq("title", data.title)
      .eq("source", "upload")
      .in("status", ["queued", "playing"])
      .maybeSingle();
    if (dup) {
      await supabaseAdmin.storage.from("song-uploads").remove([data.storagePath]);
      throw new Error("Essa música já está na fila");
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("queue_items")
      .insert({
        room_id: room.id,
        source: "upload",
        url: data.storagePath,
        title: data.title,
        artist: null,
        thumbnail_url: null,
        submitter_name: data.submitterName,
        status: "queued",
      })
      .select()
      .single();
    if (insErr) {
      await supabaseAdmin.storage.from("song-uploads").remove([data.storagePath]);
      throw new Error(insErr.message);
    }
    return inserted;
  });
