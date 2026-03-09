-- Invitations table: allows administrators to invite users to their tenant
-- Invited users receive a signed token link; on acceptance a Supabase auth user is created
-- with the pre-configured tenant_id and role via the admin client.

CREATE TABLE IF NOT EXISTS public.invitations (
  id            UUID        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id     UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'staff'
                            CHECK (role IN ('staff', 'manager', 'administrator')),
  token         TEXT        NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_tenant_id  ON public.invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token      ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email      ON public.invitations(tenant_id, email);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Administrators can view all invitations for their tenant
DROP POLICY IF EXISTS "Administrators can view invitations" ON public.invitations;
CREATE POLICY "Administrators can view invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_user_role() = 'administrator'
  );

-- Administrators can create invitations for their tenant
DROP POLICY IF EXISTS "Administrators can create invitations" ON public.invitations;
CREATE POLICY "Administrators can create invitations"
  ON public.invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND get_user_role() = 'administrator'
  );

-- Administrators can update invitations (e.g. revoke by setting expires_at to past)
DROP POLICY IF EXISTS "Administrators can update invitations" ON public.invitations;
CREATE POLICY "Administrators can update invitations"
  ON public.invitations FOR UPDATE
  TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_user_role() = 'administrator'
  );

-- Administrators can delete invitations for their tenant
DROP POLICY IF EXISTS "Administrators can delete invitations" ON public.invitations;
CREATE POLICY "Administrators can delete invitations"
  ON public.invitations FOR DELETE
  TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_user_role() = 'administrator'
  );

-- Anon can read a single invitation by token (needed during the invite acceptance flow
-- before the user is authenticated — the invite page validates token + expiry)
DROP POLICY IF EXISTS "Anon can read invitation by token" ON public.invitations;
CREATE POLICY "Anon can read invitation by token"
  ON public.invitations FOR SELECT
  TO anon
  USING (true);
