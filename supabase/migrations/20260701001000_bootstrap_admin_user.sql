-- Bootstrap the first known administrator outside of Lovable.
-- Keeps the deployment reproducible: existing users are promoted now, and the
-- same email receives admin if the account is created after this migration.

CREATE OR REPLACE FUNCTION public.assign_bootstrap_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF lower(NEW.email) = 'mateusls.cavepro@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_bootstrap_admin_role_on_auth_user_created ON auth.users;

CREATE TRIGGER assign_bootstrap_admin_role_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_bootstrap_admin_role();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'mateusls.cavepro@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
