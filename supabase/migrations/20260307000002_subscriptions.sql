-- Subscriptions table: tracks Stripe subscription state per tenant.
-- One row per tenant; managed by the Stripe webhook handler.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT        UNIQUE,
  plan                TEXT        NOT NULL DEFAULT 'free'
                                  CHECK (plan IN ('free', 'growth', 'enterprise')),
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id       ON public.subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view their own tenant's subscription
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (tenant_id = get_tenant_id());

-- Only service-role (via webhook handler) can write subscriptions
-- No INSERT/UPDATE/DELETE policies for authenticated role — all writes go through
-- the /api/stripe/webhook route handler that uses the admin client.

-- Auto-create a free-tier subscription row when a tenant is inserted.
-- This ensures every tenant always has a subscription row to query.
CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.subscriptions (tenant_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created ON public.tenants;
CREATE TRIGGER on_tenant_created
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_tenant();
