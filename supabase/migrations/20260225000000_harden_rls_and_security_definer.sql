-- Hardening migration: align RLS and function security with current Supabase guidance.
-- Non-destructive: does not drop tables or remove existing data.
-- Notes:
-- 1) Keep anon signup-list policies in place by design.
-- 2) Restrict private-table policies to authenticated users.
-- 3) Harden SECURITY DEFINER functions with empty search_path + schema-qualified refs.
-- 4) Restrict function EXECUTE privileges to authenticated role for RLS helper functions.

-- ============================================
-- RLS role scoping: private policies -> authenticated
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Users can view own tenant') THEN
    ALTER POLICY "Users can view own tenant" ON public.tenants TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'offices' AND policyname = 'Users can view offices in own tenant') THEN
    ALTER POLICY "Users can view offices in own tenant" ON public.offices TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'offices' AND policyname = 'Managers can manage offices') THEN
    ALTER POLICY "Managers can manage offices" ON public.offices TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can view users in own tenant') THEN
    ALTER POLICY "Users can view users in own tenant" ON public.users TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Administrators can manage users') THEN
    ALTER POLICY "Administrators can manage users" ON public.users TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can update own user') THEN
    ALTER POLICY "Users can update own user" ON public.users TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_profiles' AND policyname = 'Users can view staff in own tenant') THEN
    ALTER POLICY "Users can view staff in own tenant" ON public.staff_profiles TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_profiles' AND policyname = 'Managers can manage staff profiles') THEN
    ALTER POLICY "Managers can manage staff profiles" ON public.staff_profiles TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_profiles' AND policyname = 'Users can update own staff profile') THEN
    ALTER POLICY "Users can update own staff profile" ON public.staff_profiles TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Users can view projects in own tenant') THEN
    ALTER POLICY "Users can view projects in own tenant" ON public.projects TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Administrators can manage projects') THEN
    ALTER POLICY "Administrators can manage projects" ON public.projects TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_assignments' AND policyname = 'Users can view project assignments') THEN
    ALTER POLICY "Users can view project assignments" ON public.project_assignments TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_assignments' AND policyname = 'Administrators can manage project assignments') THEN
    ALTER POLICY "Administrators can manage project assignments" ON public.project_assignments TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'time_entries' AND policyname = 'Users can view time entries') THEN
    ALTER POLICY "Users can view time entries" ON public.time_entries TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'time_entries' AND policyname = 'Users can manage own time entries') THEN
    ALTER POLICY "Users can manage own time entries" ON public.time_entries TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leave_requests' AND policyname = 'Users can view leave requests') THEN
    ALTER POLICY "Users can view leave requests" ON public.leave_requests TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leave_requests' AND policyname = 'Managers can manage leave requests') THEN
    ALTER POLICY "Managers can manage leave requests" ON public.leave_requests TO authenticated;
  END IF;
END
$$;

-- ============================================
-- SECURITY DEFINER hardening
-- ============================================

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.tenant_id
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_exec()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role IN ('manager', 'administrator')
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_administrator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role = 'administrator'
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.get_project_tenant_id(p_project_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.tenant_id
  FROM public.projects AS p
  WHERE p.id = p_project_id
$$;

CREATE OR REPLACE FUNCTION public.get_user_assigned_project_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pa.project_id
  FROM public.project_assignments AS pa
  JOIN public.staff_profiles AS sp
    ON pa.staff_id = sp.id
  WHERE sp.user_id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT public.is_administrator() THEN
    RAISE EXCEPTION 'Only administrators can change user roles';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_tenant_id UUID;
  user_role TEXT;
  user_office_id UUID;
  staff_job_title TEXT;
  staff_weekly_capacity NUMERIC(5,2);
  staff_billable_rate NUMERIC(10,2);
  staff_cost_rate NUMERIC(10,2);
BEGIN
  user_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'staff');
  user_office_id := (NEW.raw_user_meta_data->>'office_id')::UUID;

  staff_job_title := NULLIF(TRIM(NEW.raw_user_meta_data->>'job_title'), '');
  staff_weekly_capacity := COALESCE((NEW.raw_user_meta_data->>'weekly_capacity_hours')::NUMERIC, 40);
  staff_billable_rate := (NEW.raw_user_meta_data->>'billable_rate')::NUMERIC;
  staff_cost_rate := (NEW.raw_user_meta_data->>'cost_rate')::NUMERIC;

  IF user_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required in user_metadata for signup';
  END IF;

  IF staff_weekly_capacity IS NOT NULL AND (staff_weekly_capacity <= 0 OR staff_weekly_capacity > 168) THEN
    staff_weekly_capacity := 40;
  END IF;

  INSERT INTO public.users (id, tenant_id, email, role, office_id)
  VALUES (
    NEW.id,
    user_tenant_id,
    NEW.email,
    user_role,
    user_office_id
  );

  INSERT INTO public.staff_profiles (
    user_id,
    tenant_id,
    job_title,
    weekly_capacity_hours,
    billable_rate,
    cost_rate
  )
  VALUES (
    NEW.id,
    user_tenant_id,
    staff_job_title,
    staff_weekly_capacity,
    NULLIF(staff_billable_rate, 0),
    NULLIF(staff_cost_rate, 0)
  );

  RETURN NEW;
END;
$$;

-- ============================================
-- Function privilege hardening
-- ============================================
-- Restrict RLS helper functions from broad execution, then grant only to authenticated.

REVOKE EXECUTE ON FUNCTION public.get_tenant_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_exec() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_administrator() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_project_tenant_id(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_assigned_project_ids(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_exec() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_administrator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_tenant_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_assigned_project_ids(UUID) TO authenticated;
