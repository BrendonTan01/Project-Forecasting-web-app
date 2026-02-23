-- Remove Executive role (redundant with Administrator)
-- Administrators can change staff roles and location (office)

-- 1. Migrate existing exec users to administrator
UPDATE users SET role = 'administrator' WHERE role = 'exec';

-- 2. Remove exec from role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('manager', 'staff', 'administrator'));

-- 3. Replace is_administrator_or_exec with is_administrator (admin-only operations)
CREATE OR REPLACE FUNCTION is_administrator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role = 'administrator' FROM users WHERE id = auth.uid()
$$;

-- 4. Drop policies that depend on is_administrator_or_exec BEFORE dropping the function
DROP POLICY IF EXISTS "Administrators can manage projects" ON projects;
DROP POLICY IF EXISTS "Administrators can manage project assignments" ON project_assignments;

-- Drop old function (no longer has dependents)
DROP FUNCTION IF EXISTS is_administrator_or_exec();

-- 5. Update is_manager_or_exec: managers and administrators can view tenant-wide data
CREATE OR REPLACE FUNCTION is_manager_or_exec()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role IN ('manager', 'administrator') FROM users WHERE id = auth.uid()
$$;

-- 6. Projects: only administrators can manage (recreate policies to use is_administrator)
DROP POLICY IF EXISTS "Administrators can manage projects" ON projects;
CREATE POLICY "Administrators can manage projects"
  ON projects FOR ALL
  USING (tenant_id = get_tenant_id() AND is_administrator())
  WITH CHECK (tenant_id = get_tenant_id() AND is_administrator());

-- 7. Project assignments: only administrators can manage
DROP POLICY IF EXISTS "Administrators can manage project assignments" ON project_assignments;
CREATE POLICY "Administrators can manage project assignments"
  ON project_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_assignments.project_id
      AND p.tenant_id = get_tenant_id()
      AND is_administrator()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_assignments.project_id
      AND p.tenant_id = get_tenant_id()
      AND is_administrator()
    )
  );

-- 8. Only administrators can change user roles and location (office)
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT is_administrator() THEN
    RAISE EXCEPTION 'Only administrators can change user roles';
  END IF;
  RETURN NEW;
END;
$$;

-- 9. Replace "Managers can manage users" with "Administrators can manage users"
DROP POLICY IF EXISTS "Managers can manage users" ON users;
CREATE POLICY "Administrators can manage users"
  ON users FOR ALL
  USING (tenant_id = get_tenant_id() AND is_administrator())
  WITH CHECK (tenant_id = get_tenant_id() AND is_administrator());
