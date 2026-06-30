
DROP POLICY IF EXISTS "Room owner reads uploads" ON storage.objects;
DROP POLICY IF EXISTS "Room owner deletes uploads" ON storage.objects;
DROP POLICY IF EXISTS "Owners manage room covers" ON storage.objects;
DROP POLICY IF EXISTS "Public read room covers" ON storage.objects;

CREATE POLICY "Room owner reads uploads" ON storage.objects FOR SELECT
USING (
  bucket_id = 'song-uploads'
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.owner_id = auth.uid()
      AND r.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY "Room owner deletes uploads" ON storage.objects FOR DELETE
USING (
  bucket_id = 'song-uploads'
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.owner_id = auth.uid()
      AND r.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY "Owners manage room covers" ON storage.objects FOR ALL
USING (
  bucket_id = 'song-uploads'
  AND (storage.foldername(storage.objects.name))[1] = 'covers'
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.owner_id = auth.uid()
      AND r.id::text = (storage.foldername(storage.objects.name))[2]
  )
)
WITH CHECK (
  bucket_id = 'song-uploads'
  AND (storage.foldername(storage.objects.name))[1] = 'covers'
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.owner_id = auth.uid()
      AND r.id::text = (storage.foldername(storage.objects.name))[2]
  )
);

CREATE POLICY "Public read room covers" ON storage.objects FOR SELECT
USING (
  bucket_id = 'song-uploads'
  AND (storage.foldername(storage.objects.name))[1] = 'covers'
);
