-- Allow week-specific assignment rows while preserving recurring rows.
--
-- Old shape: UNIQUE(project_id, staff_id)
-- New shape: UNIQUE(project_id, staff_id, week_start)
-- This enables multiple rows for the same staff/project across different weeks,
-- which is required for scoped drag-and-drop moves.

ALTER TABLE public.project_assignments
DROP CONSTRAINT IF EXISTS project_assignments_project_id_staff_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_assignments_project_staff_week_unique
  ON public.project_assignments(project_id, staff_id, week_start);
