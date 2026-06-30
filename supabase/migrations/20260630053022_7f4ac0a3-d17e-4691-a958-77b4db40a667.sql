
-- Allow room owners to upload/manage cover images under covers/{room_id}/...
CREATE POLICY "Owners manage room covers"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'song-uploads'
  AND (storage.foldername(name))[1] = 'covers'
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.owner_id = auth.uid()
      AND r.id::text = (storage.foldername(name))[2]
  )
)
WITH CHECK (
  bucket_id = 'song-uploads'
  AND (storage.foldername(name))[1] = 'covers'
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.owner_id = auth.uid()
      AND r.id::text = (storage.foldername(name))[2]
  )
);

-- Allow anyone (anon + authenticated) to read cover files for signed URL generation
CREATE POLICY "Public read room covers"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'song-uploads'
  AND (storage.foldername(name))[1] = 'covers'
);
