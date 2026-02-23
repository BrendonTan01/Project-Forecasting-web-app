-- Add Administrator role and update permissions
-- Administrator: create/modify projects, add/remove users from projects
-- Manager: view staff details, progress, projects (no project management)
-- Staff: view only assigned projects, cannot see billable/cost rates

-- 1. Add 'administrator' to role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('exec', 'manager', 'staff', 'administrator'));

-- 2. Add helper: administrators and exec can manage projects/assignments
CREATE OR REPLACE FUNCTION is_administrator_or_exec()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role IN ('exec', 'administrator') FROM users WHERE id = auth.uid()
$$;

-- 3. Update is_manager_or_exec to include administrator (for viewing tenant-wide data)
CREATE OR REPLACE FUNCTION is_manager_or_exec()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role IN ('exec', 'manager', 'administrator') FROM users WHERE id = auth.uid()
$$;

-- 4. Projects: only administrators (and exec) can INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Managers can manage projects" ON projects;
CREATE POLICY "Administrators can manage projects"
  ON projects FOR ALL
  USING (tenant_id = get_tenant_id() AND is_administrator_or_exec())
  WITH CHECK (tenant_id = get_tenant_id() AND is_administrator_or_exec());

-- 5. Project assignments: only administrators (and exec) can INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Managers can manage project assignments" ON project_assignments;
CREATE POLICY "Administrators can manage project assignments"
  ON project_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_assignments.project_id
      AND p.tenant_id = get_tenant_id()
      AND is_administrator_or_exec()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_assignments.project_id
      AND p.tenant_id = get_tenant_id()
      AND is_administrator_or_exec()
    )
  );
