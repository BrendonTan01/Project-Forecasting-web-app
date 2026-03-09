-- Staffing intelligence hiring predictions

CREATE TABLE IF NOT EXISTS public.hiring_predictions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  utilization_rate NUMERIC(6,3) NOT NULL CHECK (utilization_rate >= 0),
  hours_over_capacity NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hours_over_capacity >= 0),
  recommended_hires INTEGER NOT NULL DEFAULT 0 CHECK (recommended_hires >= 0),
  recommendation_type TEXT NOT NULL CHECK (
    recommendation_type IN ('overload', 'sustained_overload', 'underutilization', 'none')
  ),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_hiring_predictions_tenant_week
  ON public.hiring_predictions(tenant_id, week_start);

ALTER TABLE public.hiring_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can view hiring predictions" ON public.hiring_predictions;
CREATE POLICY "Managers can view hiring predictions"
  ON public.hiring_predictions FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec());

DROP POLICY IF EXISTS "Managers can manage hiring predictions" ON public.hiring_predictions;
CREATE POLICY "Managers can manage hiring predictions"
  ON public.hiring_predictions FOR ALL
  USING (tenant_id = get_tenant_id() AND is_manager_or_exec())
  WITH CHECK (tenant_id = get_tenant_id() AND is_manager_or_exec());
