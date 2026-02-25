-- Add labour scope fields and remove financial columns from project_proposals

-- Add new time-focused columns
ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS estimated_hours_per_week NUMERIC(8,2) CHECK (estimated_hours_per_week IS NULL OR estimated_hours_per_week >= 0),
  ADD COLUMN IF NOT EXISTS office_scope JSONB;

-- Drop financial columns (no longer needed for availability-focused proposals)
ALTER TABLE public.project_proposals
  DROP COLUMN IF EXISTS expected_revenue,
  DROP COLUMN IF EXISTS manual_estimated_cost,
  DROP COLUMN IF EXISTS derived_estimated_cost_override,
  DROP COLUMN IF EXISTS risk_allowance_amount,
  DROP COLUMN IF EXISTS cost_source_preference,
  DROP COLUMN IF EXISTS win_probability_percent,
  DROP COLUMN IF EXISTS schedule_confidence_percent,
  DROP COLUMN IF EXISTS cross_office_dependency_percent,
  DROP COLUMN IF EXISTS client_quality_score;

COMMENT ON COLUMN public.project_proposals.estimated_hours_per_week IS
  'Required labour hours per week for this project. If null, derived from estimated_hours and the date range.';

COMMENT ON COLUMN public.project_proposals.office_scope IS
  'JSON array of office UUIDs to include in feasibility analysis. NULL means all offices in the tenant.';
