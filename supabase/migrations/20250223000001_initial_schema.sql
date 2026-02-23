-- Capacity Intelligence Platform - Initial Schema
-- Multi-tenant architecture with RLS

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================

-- Tenants: Root of multi-tenancy
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  industry TEXT,
  default_currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Offices: Per-tenant offices with timezone support
CREATE TABLE offices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  weekly_working_hours NUMERIC(4,2) NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offices_tenant_id ON offices(tenant_id);

-- Users: Links to auth.users, tenant-scoped
-- Note: id matches auth.users.id for 1:1 relationship
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('exec', 'manager', 'staff')),
  office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_office_id ON users(office_id);

-- Staff profiles: Extended staff data (capacity, rates)
CREATE TABLE staff_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_title TEXT,
  weekly_capacity_hours NUMERIC(5,2) NOT NULL DEFAULT 40,
  billable_rate NUMERIC(10,2),
  cost_rate NUMERIC(10,2),
  -- Future-ready columns (schema prep only)
  skills JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staff_profiles_tenant_id ON staff_profiles(tenant_id);
CREATE INDEX idx_staff_profiles_user_id ON staff_profiles(user_id);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_name TEXT,
  estimated_hours NUMERIC(10,2),
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  -- Future-ready: bid_score, margin
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);

-- Project assignments: Staff to projects with allocation %
CREATE TABLE project_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  allocation_percentage NUMERIC(5,2) NOT NULL CHECK (allocation_percentage >= 0 AND allocation_percentage <= 200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, staff_id)
);

CREATE INDEX idx_project_assignments_project_id ON project_assignments(project_id);
CREATE INDEX idx_project_assignments_staff_id ON project_assignments(staff_id);

-- Time entries
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours NUMERIC(5,2) NOT NULL CHECK (hours >= 0 AND hours <= 24),
  billable_flag BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_entries_tenant_id ON time_entries(tenant_id);
CREATE INDEX idx_time_entries_tenant_date ON time_entries(tenant_id, date);
CREATE INDEX idx_time_entries_staff_id ON time_entries(staff_id);
CREATE INDEX idx_time_entries_project_id ON time_entries(project_id);

-- Leave requests
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  leave_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leave_requests_tenant_id ON leave_requests(tenant_id);
CREATE INDEX idx_leave_requests_staff_id ON leave_requests(staff_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get current user's tenant_id from users table
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid()
$$;

-- Get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;

-- Check if user is manager or exec (full tenant access)
CREATE OR REPLACE FUNCTION is_manager_or_exec()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role IN ('exec', 'manager') FROM users WHERE id = auth.uid()
$$;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- Tenants: Users see only their tenant
CREATE POLICY "Users can view own tenant"
  ON tenants FOR SELECT
  USING (id = get_tenant_id());

-- Allow anonymous to list tenants for signup (tenant picker)
CREATE POLICY "Anon can list tenants for signup"
  ON tenants FOR SELECT
  TO anon
  USING (true);

-- Offices: Tenant-scoped
CREATE POLICY "Users can view offices in own tenant"
  ON offices FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY "Managers can manage offices"
  ON offices FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec());

-- Users: Tenant-scoped; managers see all, staff see limited
CREATE POLICY "Users can view users in own tenant"
  ON users FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      is_manager_or_exec()
      OR id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage users"
  ON users FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec());

-- Staff profiles: Tenant-scoped
CREATE POLICY "Users can view staff in own tenant"
  ON staff_profiles FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      is_manager_or_exec()
      OR user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage staff profiles"
  ON staff_profiles FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec());

-- Projects: Tenant-scoped; staff see only assigned projects
CREATE POLICY "Users can view projects in own tenant"
  ON projects FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      is_manager_or_exec()
      OR id IN (
        SELECT project_id FROM project_assignments pa
        JOIN staff_profiles sp ON pa.staff_id = sp.id
        WHERE sp.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Managers can manage projects"
  ON projects FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec());

-- Project assignments: Scoped by project access
CREATE POLICY "Users can view project assignments"
  ON project_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_assignments.project_id
      AND p.tenant_id = get_tenant_id()
      AND (
        is_manager_or_exec()
        OR p.id IN (
          SELECT project_id FROM project_assignments pa
          JOIN staff_profiles sp ON pa.staff_id = sp.id
          WHERE sp.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Managers can manage project assignments"
  ON project_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_assignments.project_id
      AND p.tenant_id = get_tenant_id()
      AND is_manager_or_exec()
    )
  );

-- Time entries: Managers see all; staff see own only
CREATE POLICY "Users can view time entries"
  ON time_entries FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      is_manager_or_exec()
      OR staff_id IN (SELECT id FROM staff_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage own time entries"
  ON time_entries FOR ALL
  USING (
    tenant_id = get_tenant_id()
    AND (
      is_manager_or_exec()
      OR staff_id IN (SELECT id FROM staff_profiles WHERE user_id = auth.uid())
    )
  );

-- Leave requests: Similar to time entries
CREATE POLICY "Users can view leave requests"
  ON leave_requests FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      is_manager_or_exec()
      OR staff_id IN (SELECT id FROM staff_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Managers can manage leave requests"
  ON leave_requests FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec());

-- ============================================
-- TRIGGER: Create users row on auth signup
-- ============================================
-- Note: tenant_id must be passed in user_metadata during signup
-- This trigger creates the users row when auth.users is inserted

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tenant_id UUID;
  user_role TEXT;
  user_office_id UUID;
BEGIN
  -- Get tenant_id from metadata (required for signup)
  user_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'staff');
  user_office_id := (NEW.raw_user_meta_data->>'office_id')::UUID;

  IF user_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required in user_metadata for signup';
  END IF;

  INSERT INTO public.users (id, tenant_id, email, role, office_id)
  VALUES (
    NEW.id,
    user_tenant_id,
    NEW.email,
    user_role,
    user_office_id
  );

  -- Create staff_profile for all users (required for time entries)
  INSERT INTO public.staff_profiles (user_id, tenant_id, weekly_capacity_hours)
  VALUES (NEW.id, user_tenant_id, 40);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
