-- Update handle_new_user to populate staff_profiles from signup metadata
-- Supports: office_id, job_title, weekly_capacity_hours, billable_rate, cost_rate

-- Allow anonymous to list offices for signup (office picker)
CREATE POLICY "Anon can list offices for signup"
  ON offices FOR SELECT
  TO anon
  USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tenant_id UUID;
  user_role TEXT;
  user_office_id UUID;
  staff_job_title TEXT;
  staff_weekly_capacity NUMERIC(5,2);
  staff_billable_rate NUMERIC(10,2);
  staff_cost_rate NUMERIC(10,2);
BEGIN
  -- Get tenant_id from metadata (required for signup)
  user_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'staff');
  user_office_id := (NEW.raw_user_meta_data->>'office_id')::UUID;

  -- Staff profile fields from metadata (optional)
  staff_job_title := NULLIF(TRIM(NEW.raw_user_meta_data->>'job_title'), '');
  staff_weekly_capacity := COALESCE((NEW.raw_user_meta_data->>'weekly_capacity_hours')::NUMERIC, 40);
  staff_billable_rate := (NEW.raw_user_meta_data->>'billable_rate')::NUMERIC;
  staff_cost_rate := (NEW.raw_user_meta_data->>'cost_rate')::NUMERIC;

  IF user_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required in user_metadata for signup';
  END IF;

  -- Validate capacity if provided
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

  -- Create staff_profile with metadata from signup
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
