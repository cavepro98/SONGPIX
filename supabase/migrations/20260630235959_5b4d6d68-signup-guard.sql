CREATE OR REPLACE FUNCTION public.guard_auth_user_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allow_signups boolean;
  maintenance_mode boolean;
  request_role text;
BEGIN
  request_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

  IF request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT ps.allow_signups, ps.maintenance_mode
    INTO allow_signups, maintenance_mode
  FROM public.platform_settings ps
  WHERE ps.id = 1;

  IF COALESCE(maintenance_mode, false) THEN
    RAISE EXCEPTION 'platform in maintenance mode';
  END IF;

  IF NOT COALESCE(allow_signups, true) THEN
    RAISE EXCEPTION 'signups are disabled';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_auth_user_creation ON auth.users;

CREATE TRIGGER guard_auth_user_creation
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_auth_user_creation();

REVOKE EXECUTE ON FUNCTION public.guard_auth_user_creation() FROM PUBLIC, anon, authenticated;
