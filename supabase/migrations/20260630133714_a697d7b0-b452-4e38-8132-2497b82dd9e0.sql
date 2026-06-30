
-- 1. platform_settings: restrict SELECT to admins only
DROP POLICY IF EXISTS "Public can read platform settings" ON public.platform_settings;
CREATE POLICY "Admins read platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. has_role: switch to SECURITY INVOKER so it no longer escalates privileges.
--    The user_roles RLS policy "Users can read their own roles" lets each
--    authenticated user check their own roles, which is all this function needs.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. handle_new_user is a trigger function on auth.users — clients should
--    never call it directly. Lock down EXECUTE.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Drop the boost_queue_item SECURITY DEFINER RPC. Boosts now go through
--    a server function that uses the service-role key.
DROP FUNCTION IF EXISTS public.boost_queue_item(uuid, integer);

-- 5. Storage: remove the unrestricted INSERT policy on song-uploads.
--    Public viewers now upload through a server function (service role),
--    and owners keep cover-upload access via "Owners manage room covers".
DROP POLICY IF EXISTS "Anyone can upload song files" ON storage.objects;
