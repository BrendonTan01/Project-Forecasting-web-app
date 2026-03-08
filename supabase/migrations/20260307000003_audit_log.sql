-- Audit log table: immutable record of all significant data changes.
-- Written via service-role client only; users cannot INSERT/UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,   -- e.g. 'project.created', 'proposal.deleted'
  entity_type TEXT        NOT NULL,   -- e.g. 'project', 'proposal', 'user', 'leave_request'
  entity_id   UUID,                   -- The ID of the affected row (nullable for bulk ops)
  old_value   JSONB,                  -- Snapshot before change (null for creates)
  new_value   JSONB,                  -- Snapshot after change (null for deletes)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON public.audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_ts ON public.audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity    ON public.audit_log(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id   ON public.audit_log(user_id);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Administrators can read their own tenant's audit log
DROP POLICY IF EXISTS "Administrators can view audit log" ON public.audit_log;
CREATE POLICY "Administrators can view audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_user_role() = 'administrator'
  );

-- No INSERT/UPDATE/DELETE policies for authenticated role.
-- All writes go through the service-role admin client in server actions.
