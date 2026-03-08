-- Allow week-specific assignment rows while preserving recurring rows.
--
-- Old shape: UNIQUE(project_id, staff_id)
-- New shape:
--   1) UNIQUE(project_id, staff_id) WHERE week_start IS NULL
--   2) UNIQUE(project_id, staff_id, week_start) WHERE week_start IS NOT NULL
-- This enables multiple rows for the same staff/project across different weeks,
-- which is required for scoped drag-and-drop moves.

ALTER TABLE public.project_assignments
DROP CONSTRAINT IF EXISTS project_assignments_project_id_staff_id_key;

DROP INDEX IF EXISTS idx_project_assignments_project_staff_week_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_assignments_project_staff_base_unique
  ON public.project_assignments(project_id, staff_id)
  WHERE week_start IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_assignments_project_staff_week_unique
  ON public.project_assignments(project_id, staff_id, week_start)
  WHERE week_start IS NOT NULL;
