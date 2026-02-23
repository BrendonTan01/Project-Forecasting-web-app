-- Fix infinite recursion between projects and project_assignments RLS policies.
-- The projects SELECT policy queries project_assignments, and the
-- project_assignments SELECT policy queries projects, creating a cycle.
-- Solution: SECURITY DEFINER helper functions that bypass RLS.

-- ============================================
-- Ensure prerequisite functions exist
-- (CREATE OR REPLACE is safe if they already exist)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_exec()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role IN ('manager', 'administrator') FROM users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_administrator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role = 'administrator' FROM users WHERE id = auth.uid()
$$;

-- ============================================
-- New helpers to break the policy recursion
-- ============================================

-- Get a project's tenant_id without triggering RLS on projects
CREATE OR REPLACE FUNCTION public.get_project_tenant_id(p_project_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM projects WHERE id = p_project_id
$$;

-- Get project IDs a user is assigned to without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_assigned_project_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pa.project_id
  FROM project_assignments pa
  JOIN staff_profiles sp ON pa.staff_id = sp.id
  WHERE sp.user_id = p_user_id
$$;

-- ============================================
-- Replace the recursive policies
-- ============================================

-- Fix projects SELECT policy
DROP POLICY IF EXISTS "Users can view projects in own tenant" ON projects;
CREATE POLICY "Users can view projects in own tenant"
  ON projects FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND (
      public.is_manager_or_exec()
      OR id IN (SELECT public.get_user_assigned_project_ids(auth.uid()))
    )
  );

-- Fix project_assignments SELECT policy
DROP POLICY IF EXISTS "Users can view project assignments" ON project_assignments;
CREATE POLICY "Users can view project assignments"
  ON project_assignments FOR SELECT
  USING (
    public.get_project_tenant_id(project_id) = public.get_tenant_id()
    AND (
      public.is_manager_or_exec()
      OR staff_id IN (SELECT id FROM staff_profiles WHERE user_id = auth.uid())
    )
  );

-- Fix project_assignments FOR ALL policy
DROP POLICY IF EXISTS "Administrators can manage project assignments" ON project_assignments;
CREATE POLICY "Administrators can manage project assignments"
  ON project_assignments FOR ALL
  USING (
    public.get_project_tenant_id(project_id) = public.get_tenant_id()
    AND public.is_administrator()
  )
  WITH CHECK (
    public.get_project_tenant_id(project_id) = public.get_tenant_id()
    AND public.is_administrator()
  );
