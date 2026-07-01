import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { detectSource, type TrackMetadata, type TrackSource } from "./oembed";
import { assertPublicAppAvailable } from "./app-config.server";
import { enforceRateLimit } from "./security.server";

const SubmitInput = z.object({
  roomSlug: z.string().min(1).max(64),
  url: z.string().url().max(2000),
  submitterName: z.string().trim().min(1).max(40),
});

const UploadInput = z.object({
  roomSlug: z.string().min(1).max(64),
  fileName: z.string().min(1).max(200),
  fileBase64: z.string().min(1),
  contentType: z.string().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  submitterName: z.string().trim().min(1).max(40),
});

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function looksLikeAudio(bytes: Buffer, ext: string, mime: string): boolean {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("ascii");
  const isMp3 =
    ascii(0, 3) === "ID3" || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  const isWav = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
  const isOgg = ascii(0, 4) === "OggS";
  const isFlac = ascii(0, 4) === "fLaC";
  const isAac = bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
  const boxType = ascii(4, 8);
  const isMp4Family = boxType === "ftyp";
  const isWebm =
    bytes.length > 3 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;

  if (["mp3"].includes(ext) && isMp3) return true;
  if (["wav"].includes(ext) && isWav) return true;
  if (["ogg", "opus"].includes(ext) && isOgg) return true;
  if (["flac"].includes(ext) && isFlac) return true;
  if (["aac"].includes(ext) && isAac) return true;
  if (["m4a"].includes(ext) && isMp4Family) return true;
  if (["weba"].includes(ext) && (isWebm || isMp4Family)) return true;

  if (mime === "audio/mpeg" && isMp3) return true;
  if (mime === "audio/wav" && isWav) return true;
  if ((mime === "audio/ogg" || mime === "audio/opus") && isOgg) return true;
  if (mime === "audio/flac" && isFlac) return true;
  if (mime === "audio/aac" && isAac) return true;
  if ((mime === "audio/mp4" || mime === "audio/x-m4a") && isMp4Family) return true;
  if (mime === "audio/webm" && (isWebm || isMp4Family)) return true;

  return false;
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

async function resolveSoundcloudShortUrl(url: string): Promise<string> {
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
      return finalUrl.split("?")[0];
    }
    return url;
  } catch {
    return url;
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
    const normalizedUrl =
      source === "soundcloud" ? await resolveSoundcloudShortUrl(data.url) : data.url;

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

export const submitUploadedTrack = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UploadInput.parse(input))
  .handler(async ({ data }) => {
    enforceRateLimit({ bucket: "queue-submit-upload", limit: 8, windowMs: 60_000 });
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

    // Validate content type and extension
    if (!data.contentType.startsWith("audio/")) {
      throw new Error("Apenas arquivos de áudio são permitidos");
    }
    const allowedExt = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "weba"];
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExt.includes(ext)) {
      throw new Error("Apenas arquivos de áudio são permitidos");
    }

    // Decode + size check
    const bytes = Buffer.from(data.fileBase64, "base64");
    if (bytes.byteLength === 0) throw new Error("Arquivo vazio");
    if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("Arquivo máximo: 15 MB");
    if (!looksLikeAudio(bytes, ext, data.contentType)) {
      throw new Error("Arquivo inválido ou formato de áudio não reconhecido");
    }

    const { data: dup } = await supabaseAdmin
      .from("queue_items")
      .select("id")
      .eq("room_id", room.id)
      .eq("title", data.title)
      .eq("source", "upload")
      .in("status", ["queued", "playing"])
      .maybeSingle();
    if (dup) throw new Error("Essa música já está na fila");

    const storagePath = `${room.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("song-uploads")
      .upload(storagePath, bytes, {
        contentType: data.contentType,
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("queue_items")
      .insert({
        room_id: room.id,
        source: "upload",
        url: storagePath,
        title: data.title,
        artist: null,
        thumbnail_url: null,
        submitter_name: data.submitterName,
        status: "queued",
      })
      .select()
      .single();
    if (insErr) {
      // Clean up the uploaded file if the queue insert fails
      await supabaseAdmin.storage.from("song-uploads").remove([storagePath]);
      throw new Error(insErr.message);
    }
    return inserted;
  });

export const preparePaidUploadedTrack = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UploadInput.parse(input))
  .handler(async ({ data }) => {
    enforceRateLimit({ bucket: "queue-prepare-paid-upload", limit: 8, windowMs: 60_000 });
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
    if (!room.require_payment) throw new Error("Esta sala não exige pagamento para upload");
    if (!room.allow_upload) throw new Error("Esta sala não aceita upload de arquivo");

    if (!data.contentType.startsWith("audio/")) {
      throw new Error("Apenas arquivos de áudio são permitidos");
    }
    const allowedExt = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "weba"];
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExt.includes(ext)) {
      throw new Error("Apenas arquivos de áudio são permitidos");
    }

    const bytes = Buffer.from(data.fileBase64, "base64");
    if (bytes.byteLength === 0) throw new Error("Arquivo vazio");
    if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("Arquivo máximo: 15 MB");
    if (!looksLikeAudio(bytes, ext, data.contentType)) {
      throw new Error("Arquivo inválido ou formato de áudio não reconhecido");
    }

    const { data: dup } = await supabaseAdmin
      .from("queue_items")
      .select("id")
      .eq("room_id", room.id)
      .eq("title", data.title)
      .eq("source", "upload")
      .in("status", ["queued", "playing"])
      .maybeSingle();
    if (dup) throw new Error("Essa música já está na fila");

    const storagePath = `${room.id}/paid/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("song-uploads")
      .upload(storagePath, bytes, {
        contentType: data.contentType,
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);

    return {
      source: "upload" as const,
      url: storagePath,
      title: data.title,
    };
  });
