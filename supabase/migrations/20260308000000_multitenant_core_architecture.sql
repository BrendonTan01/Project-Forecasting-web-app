-- Multi-tenant SaaS core architecture hardening
-- Adds missing org-scoped structures while preserving existing tables.

-- -------------------------------------------------------------------
-- 1) Core column additions (non-destructive)
-- -------------------------------------------------------------------

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.staff_profiles
ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.project_assignments
ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE public.project_assignments
ADD COLUMN IF NOT EXISTS weekly_hours_allocated NUMERIC(6,2);

ALTER TABLE public.project_assignments
ALTER COLUMN weekly_hours_allocated SET DEFAULT 0;

-- -------------------------------------------------------------------
-- 2) Backfills for existing data
-- -------------------------------------------------------------------

-- Populate users.name from auth metadata or a deterministic email fallback.
UPDATE public.users u
SET name = COALESCE(
  NULLIF(TRIM(au.raw_user_meta_data->>'full_name'), ''),
  NULLIF(TRIM(au.raw_user_meta_data->>'name'), ''),
  NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
  'Unknown'
)
FROM auth.users au
WHERE au.id = u.id
  AND (u.name IS NULL OR TRIM(u.name) = '');

-- Keep staff profile name aligned when missing.
UPDATE public.staff_profiles sp
SET name = u.name
FROM public.users u
WHERE u.id = sp.user_id
  AND (sp.name IS NULL OR TRIM(sp.name) = '')
  AND u.name IS NOT NULL
  AND TRIM(u.name) <> '';

-- Backfill assignment tenant from linked project.
UPDATE public.project_assignments pa
SET tenant_id = p.tenant_id
FROM public.projects p
WHERE p.id = pa.project_id
  AND pa.tenant_id IS NULL;

-- Convert allocation_percentage model into explicit weekly hours.
UPDATE public.project_assignments pa
SET weekly_hours_allocated = ROUND(
  (COALESCE(pa.allocation_percentage, 0) / 100.0) * COALESCE(sp.weekly_capacity_hours, 0),
  2
)
FROM public.staff_profiles sp
WHERE sp.id = pa.staff_id
  AND pa.weekly_hours_allocated IS NULL;

UPDATE public.project_assignments
SET weekly_hours_allocated = 0
WHERE weekly_hours_allocated IS NULL;

-- -------------------------------------------------------------------
-- 3) Constraints and indexes for stronger integrity/perf
-- -------------------------------------------------------------------

ALTER TABLE public.project_assignments
ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.project_assignments
ALTER COLUMN weekly_hours_allocated SET NOT NULL;

ALTER TABLE public.project_assignments
ADD CONSTRAINT project_assignments_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.project_assignments
ADD CONSTRAINT project_assignments_weekly_hours_allocated_check
  CHECK (weekly_hours_allocated >= 0);

CREATE INDEX IF NOT EXISTS idx_project_assignments_tenant_id
  ON public.project_assignments(tenant_id);

CREATE INDEX IF NOT EXISTS idx_project_assignments_tenant_staff
  ON public.project_assignments(tenant_id, staff_id);

CREATE INDEX IF NOT EXISTS idx_project_assignments_tenant_project
  ON public.project_assignments(tenant_id, project_id);

-- -------------------------------------------------------------------
-- 4) Guard rails to keep assignment tenant integrity on new writes
-- -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_project_assignment_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_tenant UUID;
  staff_tenant UUID;
  staff_capacity NUMERIC(5,2);
BEGIN
  SELECT tenant_id INTO project_tenant
  FROM public.projects
  WHERE id = NEW.project_id;

  IF project_tenant IS NULL THEN
    RAISE EXCEPTION 'Project % not found', NEW.project_id;
  END IF;

  SELECT tenant_id INTO staff_tenant
  FROM public.staff_profiles
  WHERE id = NEW.staff_id;

  IF staff_tenant IS NULL THEN
    RAISE EXCEPTION 'Staff profile % not found', NEW.staff_id;
  END IF;

  IF project_tenant <> staff_tenant THEN
    RAISE EXCEPTION 'Cross-tenant assignment is not allowed';
  END IF;

  SELECT weekly_capacity_hours INTO staff_capacity
  FROM public.staff_profiles
  WHERE id = NEW.staff_id;

  NEW.tenant_id := project_tenant;
  NEW.weekly_hours_allocated := ROUND(
    (COALESCE(NEW.allocation_percentage, 0) / 100.0) * COALESCE(staff_capacity, 0),
    2
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_project_assignment_tenant_trigger
ON public.project_assignments;

CREATE TRIGGER sync_project_assignment_tenant_trigger
BEFORE INSERT OR UPDATE OF project_id, staff_id, tenant_id
ON public.project_assignments
FOR EACH ROW
EXECUTE FUNCTION public.sync_project_assignment_tenant();

-- -------------------------------------------------------------------
-- 5) New tables required for core SaaS model
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  available_hours NUMERIC(6,2) NOT NULL CHECK (available_hours >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_staff_availability_tenant_week
  ON public.staff_availability(tenant_id, week_start);

CREATE INDEX IF NOT EXISTS idx_staff_availability_staff
  ON public.staff_availability(staff_id);

CREATE TABLE IF NOT EXISTS public.forecast_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  total_capacity NUMERIC(10,2) NOT NULL CHECK (total_capacity >= 0),
  total_project_hours NUMERIC(10,2) NOT NULL CHECK (total_project_hours >= 0),
  utilization_rate NUMERIC(6,3) NOT NULL CHECK (utilization_rate >= 0),
  staffing_gap NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_forecast_results_tenant_week
  ON public.forecast_results(tenant_id, week_start);

-- Optional baseline: initialize current week availability for each staff profile.
INSERT INTO public.staff_availability (tenant_id, staff_id, week_start, available_hours)
SELECT
  sp.tenant_id,
  sp.id,
  date_trunc('week', NOW())::date,
  COALESCE(sp.weekly_capacity_hours, 0)
FROM public.staff_profiles sp
ON CONFLICT (staff_id, week_start) DO NOTHING;

-- -------------------------------------------------------------------
-- 6) RLS policies for new/updated tenant-scoped behavior
-- -------------------------------------------------------------------

ALTER TABLE public.staff_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view project assignments" ON public.project_assignments;
CREATE POLICY "Users can view project assignments"
  ON public.project_assignments FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      is_manager_or_exec()
      OR staff_id IN (
        SELECT id
        FROM public.staff_profiles
        WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Administrators can manage project assignments" ON public.project_assignments;
DROP POLICY IF EXISTS "Managers can manage project assignments" ON public.project_assignments;
CREATE POLICY "Administrators can manage project assignments"
  ON public.project_assignments FOR ALL
  USING (tenant_id = get_tenant_id() AND is_administrator())
  WITH CHECK (tenant_id = get_tenant_id() AND is_administrator());

DROP POLICY IF EXISTS "Users can view staff availability" ON public.staff_availability;
CREATE POLICY "Users can view staff availability"
  ON public.staff_availability FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      is_manager_or_exec()
      OR staff_id IN (
        SELECT id
        FROM public.staff_profiles
        WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Managers can manage staff availability" ON public.staff_availability;
CREATE POLICY "Managers can manage staff availability"
  ON public.staff_availability FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec())
  WITH CHECK (tenant_id = get_tenant_id() AND is_manager_or_exec());

DROP POLICY IF EXISTS "Managers can view forecast results" ON public.forecast_results;
CREATE POLICY "Managers can view forecast results"
  ON public.forecast_results FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec());

DROP POLICY IF EXISTS "Managers can manage forecast results" ON public.forecast_results;
CREATE POLICY "Managers can manage forecast results"
  ON public.forecast_results FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec())
  WITH CHECK (tenant_id = get_tenant_id() AND is_manager_or_exec());
