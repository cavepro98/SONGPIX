
-- 1. Remove unused tracking column to stop exposing submitter fingerprints
ALTER TABLE public.queue_items DROP COLUMN IF EXISTS submitter_fingerprint;

-- 2. Restrict profiles visibility
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT ON public.profiles FROM anon;
