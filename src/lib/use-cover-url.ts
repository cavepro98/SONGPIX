import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a room cover stored in the song-uploads bucket (e.g. "covers/{id}/...jpg")
 * into a signed URL the browser can render. Returns null while loading or when missing.
 */
export function useCoverUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!path) {
      setUrl(null);
      return;
    }
    // If already a full http(s) URL, just use it
    if (/^https?:\/\//i.test(path)) {
      setUrl(path);
      return;
    }
    supabase.storage
      .from("song-uploads")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (mounted) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      mounted = false;
    };
  }, [path]);
  return url;
}
