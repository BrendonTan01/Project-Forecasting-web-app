-- Allow managers (and administrators) to manage projects, proposals, and assignments.
-- The is_manager_or_exec() helper already returns TRUE for both 'manager' and 'administrator' roles.

-- Projects
DROP POLICY IF EXISTS "Administrators can manage projects" ON public.projects;
CREATE POLICY "Managers can manage projects" ON public.projects
  FOR ALL TO authenticated
  USING (tenant_id = public.get_tenant_id() AND public.is_manager_or_exec())
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.is_manager_or_exec());

-- Project assignments
DROP POLICY IF EXISTS "Administrators can manage project assignments" ON public.project_assignments;
CREATE POLICY "Managers can manage project assignments" ON public.project_assignments
  FOR ALL TO authenticated
  USING (public.get_project_tenant_id(project_id) = public.get_tenant_id() AND public.is_manager_or_exec())
  WITH CHECK (public.is_manager_or_exec());

-- Project proposals
DROP POLICY IF EXISTS "Administrators can manage project proposals" ON public.project_proposals;
CREATE POLICY "Managers can manage project proposals" ON public.project_proposals
  FOR ALL TO authenticated
  USING (tenant_id = public.get_tenant_id() AND public.is_manager_or_exec())
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.is_manager_or_exec());
