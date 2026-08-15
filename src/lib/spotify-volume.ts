const SPOTIFY_TOKEN_STORAGE_KEY = "songpix-spotify-token";
const SPOTIFY_PKCE_STORAGE_KEY = "songpix-spotify-pkce";
const SPOTIFY_VOLUME_SCOPE = "user-modify-playback-state";

type SpotifyToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

type SpotifyPkce = {
  verifier: string;
  redirectUri: string;
  returnTo: string;
};

export function getSpotifyClientId() {
  return import.meta.env.VITE_SPOTIFY_CLIENT_ID || import.meta.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "";
}

export function getStoredSpotifyToken(): SpotifyToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SPOTIFY_TOKEN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SpotifyToken) : null;
  } catch {
    return null;
  }
}

export function storeSpotifyToken(token: SpotifyToken | null) {
  if (typeof window === "undefined") return;
  if (!token) {
    window.localStorage.removeItem(SPOTIFY_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SPOTIFY_TOKEN_STORAGE_KEY, JSON.stringify(token));
}

function base64UrlEncode(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

async function pkceChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export function getStoredSpotifyPkce(): SpotifyPkce | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SPOTIFY_PKCE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SpotifyPkce) : null;
  } catch {
    return null;
  }
}

export function clearStoredSpotifyPkce() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SPOTIFY_PKCE_STORAGE_KEY);
}

export async function startSpotifyVolumeAuth(returnTo: string) {
  const clientId = getSpotifyClientId();
  if (!clientId) throw new Error("Configure VITE_SPOTIFY_CLIENT_ID no Vercel e no .env.");
  if (typeof window === "undefined") return;

  const verifier = randomVerifier();
  const challenge = await pkceChallenge(verifier);
  const redirectUri = `${window.location.origin}/spotify/callback`;

  window.localStorage.setItem(
    SPOTIFY_PKCE_STORAGE_KEY,
    JSON.stringify({ verifier, redirectUri, returnTo }),
  );

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SPOTIFY_VOLUME_SCOPE);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("state", "songpix-spotify-volume");
  window.location.href = url.toString();
}

export async function exchangeSpotifyCode({
  code,
  verifier,
  redirectUri,
}: {
  code: string;
  verifier: string;
  redirectUri: string;
}) {
  const clientId = getSpotifyClientId();
  if (!clientId) throw new Error("Configure VITE_SPOTIFY_CLIENT_ID para conectar o Spotify.");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || "Falha ao conectar Spotify.");

  const token: SpotifyToken = {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : undefined,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 - 30_000,
  };
  storeSpotifyToken(token);
  return token;
}

async function refreshSpotifyToken(token: SpotifyToken) {
  const clientId = getSpotifyClientId();
  if (!clientId || !token.refreshToken) return null;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;

  const next: SpotifyToken = {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : token.refreshToken,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 - 30_000,
  };
  storeSpotifyToken(next);
  return next;
}

async function getValidSpotifyToken() {
  const token = getStoredSpotifyToken();
  if (!token) return null;
  if (token.expiresAt > Date.now()) return token;
  return refreshSpotifyToken(token);
}

export async function setSpotifyPlaybackVolume(volume: number) {
  const token = await getValidSpotifyToken();
  if (!token) return "missing-token" as const;

  const volumePercent = Math.round(Math.min(1, Math.max(0, volume)) * 100);
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token.accessToken}` } },
  );
  if (res.status === 401 || res.status === 403) {
    storeSpotifyToken(null);
    return "auth-error" as const;
  }
  if (res.status === 404) return "no-device" as const;
  return res.ok ? ("ok" as const) : ("error" as const);
}
