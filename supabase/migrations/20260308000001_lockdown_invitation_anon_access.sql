-- Security hardening: remove broad anonymous read access to invitations.
-- Invite token lookup runs through server actions using the service-role client.

DROP POLICY IF EXISTS "Anon can read invitation by token" ON public.invitations;
