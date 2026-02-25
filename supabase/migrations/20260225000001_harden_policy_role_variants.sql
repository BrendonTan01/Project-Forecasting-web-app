-- Follow-up hardening for policy name variants found in existing DB state.
-- Non-destructive: only adjusts policy role scoping.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offices' AND policyname='Administrators can manage offices') THEN
    ALTER POLICY "Administrators can manage offices" ON public.offices TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staff_profiles' AND policyname='Administrators can manage staff profiles') THEN
    ALTER POLICY "Administrators can manage staff profiles" ON public.staff_profiles TO authenticated;
  END IF;
END
$$;
