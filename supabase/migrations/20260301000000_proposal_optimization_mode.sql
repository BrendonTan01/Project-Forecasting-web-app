-- Add optimization mode selector for proposal feasibility analysis.
ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS optimization_mode TEXT NOT NULL DEFAULT 'max_feasibility'
  CHECK (
    optimization_mode IN (
      'max_feasibility',
      'min_staff_count',
      'single_office_preferred',
      'multi_office_balanced',
      'min_overallocation',
      'worst_week_robust'
    )
  );

COMMENT ON COLUMN public.project_proposals.optimization_mode IS
  'Objective mode used by staff feasibility analysis for this proposal.';
