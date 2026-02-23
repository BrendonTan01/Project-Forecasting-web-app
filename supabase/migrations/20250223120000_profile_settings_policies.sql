-- Allow users to update their own profile settings (role is read-only)
-- Staff can update: staff_profiles (job_title, weekly_capacity_hours, billable_rate, cost_rate)
-- Staff can update: users.office_id only (role change blocked by trigger)

-- Prevent non-managers from changing user roles
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT is_manager_or_exec() THEN
    RAISE EXCEPTION 'Only managers can change user roles';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_prevent_role_change
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_change();

-- Staff can update their own user row (office_id, etc.) - role protected by trigger
CREATE POLICY "Users can update own user"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Staff can update their own staff_profile
CREATE POLICY "Users can update own staff profile"
  ON staff_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
