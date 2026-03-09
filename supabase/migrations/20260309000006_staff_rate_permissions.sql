-- Tighten staff rate governance:
-- - Administrators: can manage all staff profiles
-- - Managers: can update own profile + staff in same office
-- - Staff: cannot update billable_rate/cost_rate

CREATE OR REPLACE FUNCTION public.can_manage_staff_profile(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role TEXT;
  actor_office UUID;
  target_role TEXT;
  target_office UUID;
BEGIN
  SELECT role, office_id
  INTO actor_role, actor_office
  FROM public.users
  WHERE id = auth.uid();

  IF actor_role = 'administrator' THEN
    RETURN TRUE;
  END IF;

  IF actor_role = 'manager' THEN
    IF target_user_id = auth.uid() THEN
      RETURN TRUE;
    END IF;

    SELECT role, office_id
    INTO target_role, target_office
    FROM public.users
    WHERE id = target_user_id;

    RETURN target_role = 'staff'
      AND actor_office IS NOT NULL
      AND target_office = actor_office;
  END IF;

  RETURN target_user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_staff_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_staff_profile(UUID) TO authenticated;

DROP POLICY IF EXISTS "Managers can manage staff profiles" ON public.staff_profiles;
DROP POLICY IF EXISTS "Administrators can manage staff profiles" ON public.staff_profiles;

CREATE POLICY "Administrators can manage staff profiles"
  ON public.staff_profiles FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.is_administrator())
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.is_administrator());

CREATE POLICY "Managers can update managed staff profiles"
  ON public.staff_profiles FOR UPDATE
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'manager'
    AND public.can_manage_staff_profile(user_id)
  )
  WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'manager'
    AND public.can_manage_staff_profile(user_id)
  );

CREATE OR REPLACE FUNCTION public.prevent_staff_rate_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role writes are trusted (seed scripts / backend jobs).
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_manager_or_exec()
    AND (
      OLD.billable_rate IS DISTINCT FROM NEW.billable_rate
      OR OLD.cost_rate IS DISTINCT FROM NEW.cost_rate
    )
  THEN
    RAISE EXCEPTION 'Only managers or administrators can update billable/cost rates';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_profiles_prevent_rate_update ON public.staff_profiles;

CREATE TRIGGER staff_profiles_prevent_rate_update
  BEFORE UPDATE OF billable_rate, cost_rate ON public.staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_staff_rate_updates();
