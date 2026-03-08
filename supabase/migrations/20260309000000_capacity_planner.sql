-- Capacity Planner: adds week_start to project_assignments
-- and fixes the trigger to allow explicit weekly_hours_allocated on UPDATE.

-- -------------------------------------------------------------------
-- 1) Add week_start column to project_assignments
-- -------------------------------------------------------------------

ALTER TABLE public.project_assignments
ADD COLUMN IF NOT EXISTS week_start DATE;

-- Index for efficient per-tenant per-week lookups
CREATE INDEX IF NOT EXISTS idx_project_assignments_tenant_week_start
  ON public.project_assignments(tenant_id, week_start)
  WHERE week_start IS NOT NULL;

-- -------------------------------------------------------------------
-- 2) Update the trigger function
--
--    Problem: the existing trigger auto-recalculates weekly_hours_allocated
--    on any UPDATE of staff_id, overriding the value set by the PATCH
--    endpoint. We fix this by only auto-calculating on INSERT.
--
--    On UPDATE we still validate cross-tenant integrity and set tenant_id,
--    but we leave weekly_hours_allocated untouched so the caller controls it.
-- -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_project_assignment_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_tenant UUID;
  staff_tenant   UUID;
  staff_capacity NUMERIC(5,2);
BEGIN
  -- Resolve the project's tenant
  SELECT tenant_id INTO project_tenant
  FROM public.projects
  WHERE id = NEW.project_id;

  IF project_tenant IS NULL THEN
    RAISE EXCEPTION 'Project % not found', NEW.project_id;
  END IF;

  -- Resolve the staff member's tenant
  SELECT tenant_id INTO staff_tenant
  FROM public.staff_profiles
  WHERE id = NEW.staff_id;

  IF staff_tenant IS NULL THEN
    RAISE EXCEPTION 'Staff profile % not found', NEW.staff_id;
  END IF;

  -- Guard against cross-tenant assignments
  IF project_tenant <> staff_tenant THEN
    RAISE EXCEPTION 'Cross-tenant assignment is not allowed';
  END IF;

  -- Always enforce the correct tenant_id
  NEW.tenant_id := project_tenant;

  -- Only auto-derive weekly_hours_allocated on INSERT.
  -- On UPDATE the caller (e.g. the PATCH endpoint) is responsible for
  -- supplying the desired value; we leave it as-is so drag-and-drop
  -- reassignments preserve the originally allocated hours.
  IF TG_OP = 'INSERT' THEN
    SELECT weekly_capacity_hours INTO staff_capacity
    FROM public.staff_profiles
    WHERE id = NEW.staff_id;

    NEW.weekly_hours_allocated := ROUND(
      (COALESCE(NEW.allocation_percentage, 0) / 100.0) * COALESCE(staff_capacity, 0),
      2
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Re-create the trigger (definition unchanged, function body updated above)
DROP TRIGGER IF EXISTS sync_project_assignment_tenant_trigger
  ON public.project_assignments;

CREATE TRIGGER sync_project_assignment_tenant_trigger
BEFORE INSERT OR UPDATE OF project_id, staff_id, tenant_id
ON public.project_assignments
FOR EACH ROW
EXECUTE FUNCTION public.sync_project_assignment_tenant();
