-- Enforce safe role assignment in signup trigger.
-- Goal:
-- 1) Public/regular signup always creates 'staff' users.
-- 2) Service-role provisioning (admin/seed flows) may still set role explicitly.
-- 3) Prevent cross-tenant office assignment in metadata.
-- 4) Prevent billing/cost metadata injection from non-service signups.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_tenant_id UUID;
  user_role TEXT;
  user_office_id UUID;
  staff_job_title TEXT;
  staff_weekly_capacity NUMERIC(5,2);
  staff_billable_rate NUMERIC(10,2);
  staff_cost_rate NUMERIC(10,2);
  requester_role TEXT;
BEGIN
  user_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  user_office_id := (NEW.raw_user_meta_data->>'office_id')::UUID;
  requester_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

  IF user_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required in user_metadata for signup';
  END IF;

  -- Only service-role callers can assign elevated roles.
  -- All other signups are forced to staff.
  IF requester_role = 'service_role' THEN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'staff');
  ELSE
    user_role := 'staff';
  END IF;

  -- Guard against invalid role values (table check also enforces this).
  IF user_role NOT IN ('staff', 'manager', 'administrator') THEN
    user_role := 'staff';
  END IF;

  -- Office must belong to the same tenant; otherwise clear it.
  IF user_office_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.offices o
    WHERE o.id = user_office_id
      AND o.tenant_id = user_tenant_id
  ) THEN
    user_office_id := NULL;
  END IF;

  staff_job_title := NULLIF(TRIM(NEW.raw_user_meta_data->>'job_title'), '');
  staff_weekly_capacity := COALESCE((NEW.raw_user_meta_data->>'weekly_capacity_hours')::NUMERIC, 40);

  -- Financial metadata can only be set by service-role provisioning.
  IF requester_role = 'service_role' THEN
    staff_billable_rate := (NEW.raw_user_meta_data->>'billable_rate')::NUMERIC;
    staff_cost_rate := (NEW.raw_user_meta_data->>'cost_rate')::NUMERIC;
  ELSE
    staff_billable_rate := NULL;
    staff_cost_rate := NULL;
  END IF;

  IF staff_weekly_capacity IS NOT NULL AND (staff_weekly_capacity <= 0 OR staff_weekly_capacity > 168) THEN
    staff_weekly_capacity := 40;
  END IF;

  INSERT INTO public.users (id, tenant_id, email, role, office_id)
  VALUES (
    NEW.id,
    user_tenant_id,
    NEW.email,
    user_role,
    user_office_id
  );

  INSERT INTO public.staff_profiles (
    user_id,
    tenant_id,
    job_title,
    weekly_capacity_hours,
    billable_rate,
    cost_rate
  )
  VALUES (
    NEW.id,
    user_tenant_id,
    staff_job_title,
    staff_weekly_capacity,
    NULLIF(staff_billable_rate, 0),
    NULLIF(staff_cost_rate, 0)
  );

  RETURN NEW;
END;
$$;
