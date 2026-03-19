-- Extend the optimization_mode CHECK constraint to include new allocation objectives:
-- skill_coverage_max: two-pass allocation that ensures breadth of skill coverage
-- even_load: distributes hours as evenly as possible across all in-scope staff
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
      'worst_week_robust',
      'skill_coverage_max',
      'even_load'
    )
  );
