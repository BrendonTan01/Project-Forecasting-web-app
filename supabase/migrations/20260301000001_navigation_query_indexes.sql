-- Improve common navigation query patterns for dashboard/capacity/projects pages.
CREATE INDEX IF NOT EXISTS idx_projects_tenant_status_name
  ON public.projects (tenant_id, status, name);

CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_status_start_end
  ON public.leave_requests (tenant_id, status, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_project_proposals_tenant_status_created_desc
  ON public.project_proposals (tenant_id, status, created_at DESC);
