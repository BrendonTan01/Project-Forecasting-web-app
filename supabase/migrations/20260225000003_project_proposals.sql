-- Project proposals for future bid forecasting metrics
-- Separate from active delivery projects to preserve delivery reporting.

CREATE TABLE public.project_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_name TEXT,
  proposed_start_date DATE,
  proposed_end_date DATE,
  estimated_hours NUMERIC(10,2) CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  expected_revenue NUMERIC(12,2) CHECK (expected_revenue IS NULL OR expected_revenue >= 0),
  manual_estimated_cost NUMERIC(12,2) CHECK (manual_estimated_cost IS NULL OR manual_estimated_cost >= 0),
  derived_estimated_cost_override NUMERIC(12,2) CHECK (derived_estimated_cost_override IS NULL OR derived_estimated_cost_override >= 0),
  risk_allowance_amount NUMERIC(12,2) CHECK (risk_allowance_amount IS NULL OR risk_allowance_amount >= 0),
  win_probability_percent NUMERIC(5,2) CHECK (win_probability_percent IS NULL OR (win_probability_percent >= 0 AND win_probability_percent <= 100)),
  schedule_confidence_percent NUMERIC(5,2) CHECK (schedule_confidence_percent IS NULL OR (schedule_confidence_percent >= 0 AND schedule_confidence_percent <= 100)),
  cross_office_dependency_percent NUMERIC(5,2) CHECK (cross_office_dependency_percent IS NULL OR (cross_office_dependency_percent >= 0 AND cross_office_dependency_percent <= 100)),
  client_quality_score NUMERIC(5,2) CHECK (client_quality_score IS NULL OR (client_quality_score >= 0 AND client_quality_score <= 100)),
  cost_source_preference TEXT NOT NULL DEFAULT 'manual_first' CHECK (cost_source_preference IN ('manual_first', 'derived_first')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'won', 'lost')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (proposed_end_date IS NULL OR proposed_start_date IS NULL OR proposed_end_date >= proposed_start_date)
);

CREATE INDEX idx_project_proposals_tenant_id ON public.project_proposals(tenant_id);
CREATE INDEX idx_project_proposals_status ON public.project_proposals(status);
CREATE INDEX idx_project_proposals_proposed_start_date ON public.project_proposals(proposed_start_date);
CREATE INDEX idx_project_proposals_tenant_status_start ON public.project_proposals(tenant_id, status, proposed_start_date);

ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view project proposals in own tenant"
  ON public.project_proposals FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() IN ('manager', 'administrator')
  );

CREATE POLICY "Administrators can manage project proposals"
  ON public.project_proposals FOR ALL
  TO authenticated
  USING (tenant_id = public.get_tenant_id() AND public.is_administrator())
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.is_administrator());
