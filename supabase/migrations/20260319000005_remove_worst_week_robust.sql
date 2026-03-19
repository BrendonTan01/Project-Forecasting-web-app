-- Remove deprecated optimization mode from proposal records and constraint.
-- optimization_mode is a TEXT column guarded by CHECK constraint (not a DB enum).

-- 1) Remap existing rows to a supported closest alternative.
UPDATE public.project_proposals
SET optimization_mode = 'min_overallocation'
WHERE optimization_mode = 'worst_week_robust';

-- 2) Replace CHECK constraint without the deprecated mode.
ALTER TABLE public.project_proposals
  DROP CONSTRAINT IF EXISTS project_proposals_optimization_mode_check;

ALTER TABLE public.project_proposals
  ADD CONSTRAINT project_proposals_optimization_mode_check
  CHECK (
    optimization_mode IN (
      'max_feasibility',
      'min_staff_count',
      'single_office_preferred',
      'multi_office_balanced',
      'min_overallocation',
      'skill_coverage_max',
      'even_load'
    )
  );
