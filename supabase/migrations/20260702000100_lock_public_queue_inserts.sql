-- Public queue inserts must go through server functions so room rules,
-- paid-only mode, source validation, playlist blocking, and upload checks run.
DROP POLICY IF EXISTS "Anyone can submit to open rooms" ON public.queue_items;

REVOKE INSERT ON public.queue_items FROM anon;
REVOKE INSERT ON public.queue_items FROM authenticated;
