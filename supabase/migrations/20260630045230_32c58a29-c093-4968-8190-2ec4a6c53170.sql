
-- anyone (anon + authenticated) can upload to song-uploads
CREATE POLICY "Anyone can upload song files"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'song-uploads');

-- room owner reads files in their room's folder (first path segment = room id)
CREATE POLICY "Room owner reads uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'song-uploads'
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id::text = (storage.foldername(name))[1]
      AND r.owner_id = auth.uid()
  )
);

-- room owner deletes uploads
CREATE POLICY "Room owner deletes uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'song-uploads'
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id::text = (storage.foldername(name))[1]
      AND r.owner_id = auth.uid()
  )
);
