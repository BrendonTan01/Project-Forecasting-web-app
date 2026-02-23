-- Capacity Intelligence Platform - Seed Data
-- Run after migrations. Creates 1 tenant, 3 offices, 20 staff, 5 projects, time entries, leave.
-- Note: Auth users must be created via Supabase Auth (signUp). This seed creates the app data.
-- For local dev, you may need to create auth users first and get their IDs.

-- ============================================
-- TENANT
-- ============================================
INSERT INTO tenants (id, name, industry, default_currency)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Acme Engineering Consultants',
  'Engineering',
  'USD'
)
ON CONFLICT DO NOTHING;

-- ============================================
-- OFFICES (3 offices, different timezones)
-- ============================================
INSERT INTO offices (id, tenant_id, name, country, timezone, weekly_working_hours)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'London HQ', 'UK', 'Europe/London', 40),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Singapore Office', 'Singapore', 'Asia/Singapore', 40),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Sydney Office', 'Australia', 'Australia/Sydney', 37.5)
ON CONFLICT DO NOTHING;

-- ============================================
-- AUTH USERS + APP USERS + STAFF PROFILES
-- ============================================
-- IMPORTANT: You must create auth.users first via Supabase Auth (Dashboard or API).
-- Then insert into public.users with matching id.
-- This seed assumes you will run it AFTER creating auth users, or use the Supabase seed flow.
--
-- For testing, create one auth user manually:
-- 1. Go to Supabase Dashboard -> Authentication -> Users -> Add user
-- 2. Email: admin@acme.com, Password: (your choice)
-- 3. Copy the user ID and use below
--
-- Example (replace USER_ID with actual auth.users id):
INSERT INTO users (id, tenant_id, email, role, office_id)
VALUES ('ebee5529-f6a6-4cd4-add8-b743d7711fec', 'a0000000-0000-0000-0000-000000000001', 'admin@acme.com', 'exec', 'b0000000-0000-0000-0000-000000000001');
--
INSERT INTO staff_profiles (user_id, tenant_id, job_title, weekly_capacity_hours, billable_rate, cost_rate)
VALUES ('ebee5529-f6a6-4cd4-add8-b743d7711fec', 'a0000000-0000-0000-0000-000000000001', 'Managing Director', 40, 250, 120);

-- ============================================
-- PROJECTS (5 projects)
-- ============================================
INSERT INTO projects (id, tenant_id, name, client_name, estimated_hours, start_date, end_date, status)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Bridge Design Phase 1', 'City Council', 400, '2025-01-01', '2025-06-30', 'active'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'HVAC Retrofit Study', 'Property Corp', 120, '2025-02-01', '2025-04-30', 'active'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Structural Assessment', 'Insurance Co', 80, '2025-01-15', '2025-03-15', 'active'),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'MEP Design Package', 'Developer Ltd', 600, '2024-11-01', '2025-08-31', 'active'),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Feasibility Study', 'New Client Inc', 50, '2025-02-10', '2025-03-10', 'active')
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED SCRIPT INSTRUCTIONS
-- ============================================
-- To fully seed the database:
-- 1. Run migrations: supabase db push (or apply 001_initial_schema.sql)
-- 2. Create auth users via Supabase Dashboard or API with user_metadata: { tenant_id, role, office_id }
-- 3. The handle_new_user trigger will create users + staff_profiles automatically
-- 4. Run this seed for projects (tenant + offices + projects)
-- 5. Manually add project_assignments, time_entries, leave_requests via the app or additional SQL
--
-- For a quick demo, sign up at /signup with:
-- - Company: Acme Engineering Consultants
-- - Your email/password
-- - Role: Executive
-- The trigger will create your user and staff_profile. Then you can add more data via the UI.
