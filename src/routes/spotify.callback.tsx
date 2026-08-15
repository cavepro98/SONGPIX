import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  clearStoredSpotifyPkce,
  exchangeSpotifyCode,
  getStoredSpotifyPkce,
} from "@/lib/spotify-volume";

export const Route = createFileRoute("/spotify/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Conectando Spotify | SongPIX" }] }),
  component: SpotifyCallback,
});

function SpotifyCallback() {
  useEffect(() => {
    let cancelled = false;
    const goBack = (returnTo: string) => {
      if (!cancelled) window.location.replace(returnTo);
    };
    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const pkce = getStoredSpotifyPkce();
      clearStoredSpotifyPkce();

      const returnTo = pkce?.returnTo || "/dashboard";
      if (!code || state !== "songpix-spotify-volume" || !pkce?.verifier || !pkce.redirectUri) {
        toast.error("Não foi possível conectar o Spotify.");
        goBack(returnTo);
        return;
      }

      try {
        await exchangeSpotifyCode({
          code,
          verifier: pkce.verifier,
          redirectUri: pkce.redirectUri,
        });
        toast.success("Spotify conectado para controle de volume.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao conectar Spotify.");
      } finally {
        goBack(returnTo);
      }
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <div className="font-display text-2xl font-bold italic uppercase tracking-tighter">
          Conectando Spotify
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Aguarde alguns segundos...</p>
      </div>
    </div>
  );
}
