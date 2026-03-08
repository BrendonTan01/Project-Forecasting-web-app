-- Make project_assignments upsert-compatible for ON CONFLICT (project_id, staff_id, week_start).
--
-- The API uses:
--   upsert(..., { onConflict: "project_id,staff_id,week_start" })
-- Postgres can only infer non-partial unique indexes/constraints for that target.
-- The previous week index was partial (WHERE week_start IS NOT NULL), which causes:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Keep two invariants:
-- 1) At most one recurring assignment row per project+staff (week_start IS NULL)
-- 2) At most one week-specific row per project+staff+week_start

-- Remove the partial week-specific unique index.
DROP INDEX IF EXISTS public.idx_project_assignments_project_staff_week_unique;

-- Recreate week-specific uniqueness as a non-partial unique index so ON CONFLICT can infer it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_assignments_project_staff_week_unique
  ON public.project_assignments(project_id, staff_id, week_start);

-- Preserve single recurring row uniqueness for week_start IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_assignments_project_staff_base_unique
  ON public.project_assignments(project_id, staff_id)
  WHERE week_start IS NULL;
