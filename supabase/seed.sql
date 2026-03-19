-- Capacity Intelligence Platform - Comprehensive Seed Data
-- Tests all features with users across all roles: administrator, manager, staff
-- Run: supabase db reset (or supabase start for first time)
-- All test users share password: TestPassword123!

-- Enable password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
-- AUTH USERS (all roles: administrator, manager, staff)
-- handle_new_user trigger creates users + staff_profiles automatically
-- Password for all: TestPassword123!
-- ============================================
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES
  -- Administrator (full tenant access, manage projects/users)
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'admin@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"administrator","full_name":"Morgan Reed","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Managing Director","weekly_capacity_hours":40,"billable_rate":250,"cost_rate":120}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  -- Manager 1 (view tenant-wide, no project management)
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'manager.london@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"manager","full_name":"Amelia Grant","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Project Manager","weekly_capacity_hours":40,"billable_rate":180,"cost_rate":95}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  -- Manager 2 (Singapore)
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'manager.singapore@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"manager","full_name":"Ethan Lim","office_id":"b0000000-0000-0000-0000-000000000002","job_title":"Regional Manager","weekly_capacity_hours":40,"billable_rate":200,"cost_rate":100}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  -- Staff 1 (London)
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'staff.engineer@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","full_name":"Noah Patel","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Senior Engineer","weekly_capacity_hours":40,"billable_rate":150,"cost_rate":75}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  -- Staff 2 (Singapore)
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'staff.designer@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","full_name":"Sofia Tan","office_id":"b0000000-0000-0000-0000-000000000002","job_title":"Design Engineer","weekly_capacity_hours":40,"billable_rate":130,"cost_rate":65}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  -- Staff 3 (Sydney)
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000006',
    'authenticated',
    'authenticated',
    'staff.analyst@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","full_name":"Liam O''Connor","office_id":"b0000000-0000-0000-0000-000000000003","job_title":"Structural Analyst","weekly_capacity_hours":37.5,"billable_rate":140,"cost_rate":70}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ),
  -- Staff 4 (London, unassigned to projects - tests staff with no assignments)
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000007',
    'authenticated',
    'authenticated',
    'staff.new@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","full_name":"Priya Nair","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Junior Engineer","weekly_capacity_hours":40,"billable_rate":90,"cost_rate":45}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PUBLIC USERS + STAFF_PROFILES (from auth.users)
-- The handle_new_user trigger may not fire on direct auth.users INSERT in seed.
-- Explicitly populate to ensure tenant_id/role exist for RLS (get_tenant_id, is_manager_or_exec).
-- ============================================
INSERT INTO public.users (id, tenant_id, email, role, office_id, name)
SELECT
  id,
  (raw_user_meta_data->>'tenant_id')::uuid,
  email,
  COALESCE(NULLIF(TRIM(raw_user_meta_data->>'role'), ''), 'staff'),
  (raw_user_meta_data->>'office_id')::uuid,
  COALESCE(
    NULLIF(TRIM(raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(split_part(email, '@', 1)), ''),
    'Unknown'
  )
FROM auth.users
WHERE email LIKE '%@acme.com'
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  office_id = EXCLUDED.office_id,
  name = EXCLUDED.name;

INSERT INTO public.staff_profiles (user_id, tenant_id, name, job_title, weekly_capacity_hours, billable_rate, cost_rate)
SELECT
  id,
  (raw_user_meta_data->>'tenant_id')::uuid,
  COALESCE(
    NULLIF(TRIM(raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(split_part(email, '@', 1)), ''),
    'Unknown'
  ),
  NULLIF(TRIM(raw_user_meta_data->>'job_title'), ''),
  COALESCE((raw_user_meta_data->>'weekly_capacity_hours')::numeric, 40),
  NULLIF((raw_user_meta_data->>'billable_rate')::numeric, 0),
  NULLIF((raw_user_meta_data->>'cost_rate')::numeric, 0)
FROM auth.users
WHERE email LIKE '%@acme.com'
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  name = EXCLUDED.name,
  job_title = EXCLUDED.job_title,
  weekly_capacity_hours = EXCLUDED.weekly_capacity_hours,
  billable_rate = EXCLUDED.billable_rate,
  cost_rate = EXCLUDED.cost_rate;

-- Auth identities (required for login)
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
SELECT
  extensions.gen_random_uuid(),
  id,
  id,
  format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
  'email',
  NOW(),
  NOW()
FROM auth.users
WHERE email LIKE '%@acme.com'
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ============================================
-- PROJECTS (5 projects, various statuses)
-- ============================================
INSERT INTO projects (id, tenant_id, name, client_name, estimated_hours, start_date, end_date, status)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Bridge Design Phase 1', 'City Council', 400, '2026-01-01', '2026-06-30', 'active'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'HVAC Retrofit Study', 'Property Corp', 120, '2026-02-01', '2026-04-30', 'active'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Structural Assessment', 'Insurance Co', 80, '2026-01-15', '2026-03-15', 'active'),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'MEP Design Package', 'Developer Ltd', 600, '2025-11-01', '2026-08-31', 'active'),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Feasibility Study', 'New Client Inc', 50, '2026-02-10', '2026-03-10', 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PROJECT PROPOSALS (future bid pipeline)
-- Includes complete + partial inputs to test dashboard warnings
-- Note: financial columns were dropped in migration 20260225000004
-- ============================================
INSERT INTO project_proposals (
  id,
  tenant_id,
  name,
  client_name,
  proposed_start_date,
  proposed_end_date,
  estimated_hours,
  estimated_hours_per_week,
  office_scope,
  win_probability,
  optimization_mode,
  status,
  notes
)
VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Airport Terminal Structural Bid',
    'National Airport Authority',
    '2026-07-01',
    '2027-03-31',
    1400,
    NULL,
    NULL,
    70,
    'max_feasibility',
    'submitted',
    'Cross-office delivery between London and Singapore. Analyst has 2-week leave in July — tests leave deduction in feasibility.'
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Data Center Expansion Proposal',
    'CloudScale Partners',
    '2026-09-01',
    '2027-06-30',
    2200,
    NULL,
    '["b0000000-0000-0000-0000-000000000003"]'::jsonb,
    45,
    'single_office_preferred',
    'draft',
    'Scoped to Sydney office only — tests office_scope filter in feasibility. Higher hand-off risk due to Sydney specialist coverage.'
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Transit Corridor Preliminary Design',
    'Metro Transport Office',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    20,
    'min_staff_count',
    'draft',
    'Intentionally partial inputs — no dates, no hours. Tests completeness warnings and feasibility error path.'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PROJECT ASSIGNMENTS (staff to projects)
-- ============================================
INSERT INTO project_assignments (project_id, staff_id, allocation_percentage)
SELECT p.id, sp.id, alloc
FROM (VALUES
  ('c0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 50),
  ('c0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005', 30),
  ('c0000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', 100),
  ('c0000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000006', 80),
  ('c0000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004', 20),
  ('c0000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000005', 60),
  ('c0000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000006', 40),
  ('c0000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000006', 100)
) AS v(project_id, user_id, alloc)
JOIN projects p ON p.id = v.project_id::uuid
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid;

-- ============================================
-- TIME ENTRIES (historical and recent - for forecasting demo)
-- Covers Jan-Feb 2026 so dashboard shows utilisation, project health, burn rate
-- ============================================
INSERT INTO time_entries (tenant_id, staff_id, project_id, date, hours, billable_flag)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  sp.id,
  v.project_id::uuid,
  v.entry_date::date,
  v.hours,
  v.billable
FROM (VALUES
  -- Staff 1 (engineer): Bridge Design + HVAC + Structural
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-02', 10, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-03', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-04', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', '2026-02-05', 6, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', '2026-02-06', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-09', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-10', 6, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', '2026-02-11', 4, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', '2026-02-12', 2, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-13', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-16', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', '2026-02-17', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', '2026-02-18', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-19', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-20', 6, true),
  -- Staff 2 (designer): Bridge Design + MEP
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', '2026-02-02', 10, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', '2026-02-03', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-04', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-05', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', '2026-02-06', 6, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', '2026-02-09', 4, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-10', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-11', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-12', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-13', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-16', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', '2026-02-17', 4, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-18', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-19', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-20', 6, true),
  -- Staff 3 (analyst): Structural + MEP + Feasibility
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', '2026-02-02', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-02-03', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', '2026-02-04', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-02-05', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000005', '2026-02-06', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', '2026-02-09', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-02-11', 6, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000005', '2026-02-12', 2, false),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', '2026-02-13', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-02-16', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000005', '2026-02-17', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-02-18', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000005', '2026-02-19', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-02-20', 6, true),
  -- Jan 2026 (older history for burn rate / forecasting)
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-01-12', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-01-13', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-01-14', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-01-15', 8, true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-01-16', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-01-12', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-01-13', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-01-14', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-01-15', 8, true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-01-16', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', '2026-01-12', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-01-13', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-01-14', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-01-15', 8, true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '2026-01-16', 8, true)
) AS v(user_id, project_id, entry_date, hours, billable)
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid;

-- ============================================
-- LEAVE REQUESTS (pending, approved, rejected)
-- ============================================
INSERT INTO leave_requests (tenant_id, staff_id, start_date, end_date, leave_type, status)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  sp.id,
  v.start_date::date,
  v.end_date::date,
  v.leave_type,
  v.status
FROM (VALUES
  ('d1000000-0000-0000-0000-000000000004', '2026-03-16', '2026-03-18', 'annual', 'pending'),
  ('d1000000-0000-0000-0000-000000000005', '2026-02-19', '2026-02-20', 'sick', 'approved'),
  ('d1000000-0000-0000-0000-000000000006', '2026-04-01', '2026-04-03', 'annual', 'approved'),
  ('d1000000-0000-0000-0000-000000000007', '2026-03-02', '2026-03-03', 'annual', 'rejected')
) AS v(user_id, start_date, end_date, leave_type, status)
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid;

-- ============================================
-- ADDITIONAL OFFICE (empty — for office-scope test)
-- ============================================
INSERT INTO offices (id, tenant_id, name, country, timezone, weekly_working_hours)
VALUES
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Dubai Office', 'UAE', 'Asia/Dubai', 40)
ON CONFLICT DO NOTHING;

-- ============================================
-- ADDITIONAL AUTH USERS
-- Staff 5: Part-time (London, 20h/week) — tests non-40h capacity calcs
-- Staff 6: No office assigned — excluded from office-scoped proposals
-- ============================================
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000008',
    'authenticated', 'authenticated',
    'staff.parttime@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","full_name":"Mia Collins","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Part-Time Technician","weekly_capacity_hours":20,"billable_rate":80,"cost_rate":40}'::jsonb,
    NOW(), NOW(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000009',
    'authenticated', 'authenticated',
    'staff.nooffice@acme.com',
    extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","full_name":"Jordan Blake","office_id":null,"job_title":"Remote Specialist","weekly_capacity_hours":40,"billable_rate":120,"cost_rate":60}'::jsonb,
    NOW(), NOW(), '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, tenant_id, email, role, office_id, name)
SELECT
  id,
  (raw_user_meta_data->>'tenant_id')::uuid,
  email,
  COALESCE(NULLIF(TRIM(raw_user_meta_data->>'role'), ''), 'staff'),
  NULLIF(TRIM(raw_user_meta_data->>'office_id'), 'null')::uuid,
  COALESCE(
    NULLIF(TRIM(raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(split_part(email, '@', 1)), ''),
    'Unknown'
  )
FROM auth.users
WHERE email IN ('staff.parttime@acme.com', 'staff.nooffice@acme.com')
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  email     = EXCLUDED.email,
  role      = EXCLUDED.role,
  office_id = EXCLUDED.office_id,
  name      = EXCLUDED.name;

INSERT INTO public.staff_profiles (user_id, tenant_id, name, job_title, weekly_capacity_hours, billable_rate, cost_rate)
SELECT
  id,
  (raw_user_meta_data->>'tenant_id')::uuid,
  COALESCE(
    NULLIF(TRIM(raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(split_part(email, '@', 1)), ''),
    'Unknown'
  ),
  NULLIF(TRIM(raw_user_meta_data->>'job_title'), ''),
  COALESCE((raw_user_meta_data->>'weekly_capacity_hours')::numeric, 40),
  NULLIF((raw_user_meta_data->>'billable_rate')::numeric, 0),
  NULLIF((raw_user_meta_data->>'cost_rate')::numeric, 0)
FROM auth.users
WHERE email IN ('staff.parttime@acme.com', 'staff.nooffice@acme.com')
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id             = EXCLUDED.tenant_id,
  name                  = EXCLUDED.name,
  job_title             = EXCLUDED.job_title,
  weekly_capacity_hours = EXCLUDED.weekly_capacity_hours,
  billable_rate         = EXCLUDED.billable_rate,
  cost_rate             = EXCLUDED.cost_rate;

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
SELECT
  extensions.gen_random_uuid(), id, id,
  format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
  'email', NOW(), NOW()
FROM auth.users
WHERE email IN ('staff.parttime@acme.com', 'staff.nooffice@acme.com')
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ============================================
-- ADDITIONAL PROJECTS (all statuses + all health states)
-- ============================================
INSERT INTO projects (id, tenant_id, name, client_name, estimated_hours, start_date, end_date, status)
VALUES
  -- Status coverage: on_hold, completed, cancelled
  ('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Waterfront Survey',        'Harbour Authority',   200,  '2026-01-01', '2026-09-30', 'on_hold'),
  ('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Old Warehouse Report',     'Heritage Trust',      150,  '2025-06-01', '2025-12-31', 'completed'),
  ('c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Airport Expansion Prelim', 'Regional Airport',    500,  '2025-09-01', '2026-01-31', 'cancelled'),
  -- Health state: no_estimate (NULL estimated_hours)
  ('c0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'Ad-hoc Support Contract',  'Various Clients',     NULL, '2026-01-01', '2026-12-31', 'active'),
  -- Health state: overrun (actual > estimated; 30h logged on 20h estimate)
  ('c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Emergency Facade Repair',  'City Properties Ltd', 20,   '2026-02-01', '2026-03-31', 'active'),
  -- Health state: overrun (actual > estimated; 101h logged on 100h estimate)
  ('c0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Seismic Analysis',         'Safe Structures Co',  100,  '2026-01-05', '2026-03-31', 'active'),
  -- Health state: at_risk (actual > 90% and <= 100%; 95h logged on 100h estimate)
  ('c0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'Floodplain Stress Study',  'Riverworks Alliance', 100,  '2026-01-12', '2026-04-30', 'active'),
  -- Clean baseline: active, no time entries yet
  ('c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Safety Audit FY2026',      'Industrial Group',    300,  '2026-04-01', '2026-10-31', 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ADDITIONAL PROJECT ASSIGNMENTS
-- Includes overallocation scenarios (>100% total allocation per staff)
-- ============================================
INSERT INTO project_assignments (project_id, staff_id, allocation_percentage)
SELECT p.id, sp.id, alloc
FROM (VALUES
  -- Emergency Facade Repair: parttime at 100%
  ('c0000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000008', 100),
  -- Ad-hoc Support Contract: parttime at 80% + nooffice at 60%
  -- parttime total = 100 + 80 = 180% (overallocated)
  ('c0000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000008', 80),
  ('c0000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000009', 60),
  -- Seismic Analysis: analyst at 60% + nooffice at 80%
  ('c0000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000006', 60),
  ('c0000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000009', 80),
  -- Floodplain Stress Study: analyst at 50%
  ('c0000000-0000-0000-0000-000000000013', 'd1000000-0000-0000-0000-000000000006', 50),
  -- Safety Audit: nooffice at 40%
  -- nooffice total = 60 + 80 + 40 = 180% (overallocated)
  ('c0000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000009', 40)
) AS v(project_id, user_id, alloc)
JOIN projects p ON p.id = v.project_id::uuid
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid;

-- ============================================
-- CAPACITY PLANNER WEEK-SPECIFIC ASSIGNMENT OVERRIDES
-- Demonstrates week_start rows used by drag/move logic
-- ============================================
INSERT INTO project_assignments (project_id, staff_id, allocation_percentage, week_start)
SELECT p.id, sp.id, alloc, v.week_start::date
FROM (VALUES
  -- Engineer: temporary reassignment and reduced load in March
  ('c0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 20, '2026-03-09'),
  ('c0000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', 80, '2026-03-09'),
  ('c0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 30, '2026-03-16'),
  -- Part-time staff: explicit weekly override for forecast/capacity planner
  ('c0000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000008', 60, '2026-03-09')
) AS v(project_id, user_id, alloc, week_start)
JOIN projects p ON p.id = v.project_id::uuid
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid
ON CONFLICT (project_id, staff_id, week_start) DO NOTHING;

-- ============================================
-- ADDITIONAL TIME ENTRIES
-- Covers: overrun project, at_risk project, no_estimate project,
--         edge cases (0h, 24h, weekend, future date, duplicate same-day,
--         non-billable, part-time capacity)
-- ============================================
INSERT INTO time_entries (tenant_id, staff_id, project_id, date, hours, billable_flag)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  sp.id,
  v.project_id::uuid,
  v.entry_date::date,
  v.hours,
  v.billable
FROM (VALUES
  -- ------------------------------------------------
  -- OVERRUN: Emergency Facade Repair (c010)
  -- staff.parttime logs 30h on a 20h estimate → overrun
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000010', '2026-02-02', 6,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000010', '2026-02-03', 6,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000010', '2026-02-04', 6,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000010', '2026-02-05', 6,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000010', '2026-02-09', 6,  true),
  -- ------------------------------------------------
  -- OVERRUN: Seismic Analysis (c011)
  -- staff.analyst logs 93h plus nooffice logs 8h non-billable on 100h estimate → overrun
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-05', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-06', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-07', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-08', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-09', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-19', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-20', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-21', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-22', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-23', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-26', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', '2026-01-27', 5,  true),
  -- ------------------------------------------------
  -- AT-RISK: Floodplain Stress Study (c013)
  -- staff.analyst logs 95h on a 100h estimate → at_risk (>90% and <=100%)
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-02', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-03', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-04', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-05', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-06', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-09', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-10', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-11', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-12', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-13', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-16', 8,  true),
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', '2026-03-17', 7,  true),
  -- ------------------------------------------------
  -- NO-ESTIMATE: Ad-hoc Support Contract (c009)
  -- Valid entries on a project with NULL estimated_hours → no_estimate badge
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000009', '2026-02-10', 4,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000009', '2026-02-11', 4,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000009', '2026-02-12', 4,  true),
  -- ------------------------------------------------
  -- nooffice staff: non-billable entries on Seismic Analysis
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000011', '2026-02-09', 4,  false),
  ('d1000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000011', '2026-02-10', 4,  false),
  -- ------------------------------------------------
  -- EDGE CASE: 0.0 hours (minimum boundary — DB allows CHECK hours >= 0)
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-25', 0,  true),
  -- ------------------------------------------------
  -- EDGE CASE: 24.0 hours (maximum boundary — DB allows CHECK hours <= 24)
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-24', 24, true),
  -- ------------------------------------------------
  -- EDGE CASE: Weekend entries (Sat + Sun) — DB does not block these
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', '2026-02-21', 4,  true),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', '2026-02-22', 2,  true),
  -- ------------------------------------------------
  -- EDGE CASE: Future-dated entry (March 2026) — valid at DB level
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-03-05', 8,  true),
  -- ------------------------------------------------
  -- EDGE CASE: Same day/same project split by billable flag
  -- Unique constraint includes billable_flag, so one billable + one non-billable row is valid
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-23', 4,  true),
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', '2026-02-23', 4,  false),
  -- ------------------------------------------------
  -- EDGE CASE: Non-billable entries (billable_flag=false)
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', '2026-02-26', 3,  false),
  ('d1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', '2026-02-26', 2,  false),
  -- ------------------------------------------------
  -- PART-TIME staff capacity demo: 4h/day entries (20h/week capacity)
  -- ------------------------------------------------
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000010', '2026-02-16', 4,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000010', '2026-02-17', 4,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000009', '2026-02-18', 4,  true),
  ('d1000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000009', '2026-02-19', 4,  true)
) AS v(user_id, project_id, entry_date, hours, billable)
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid;

-- ============================================
-- ADDITIONAL PROJECT PROPOSALS
-- Covers: won, lost, hours_per_week path, missing-dates error, leave-overlap
-- ============================================
INSERT INTO project_proposals (
  id,
  tenant_id,
  name,
  client_name,
  proposed_start_date,
  proposed_end_date,
  estimated_hours,
  estimated_hours_per_week,
  office_scope,
  win_probability,
  optimization_mode,
  status,
  notes
)
VALUES
  -- Won proposal
  (
    'e0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'Harbour Bridge Renewal',
    'Roads & Maritime Services',
    '2025-06-01',
    '2025-12-31',
    800,
    NULL,
    NULL,
    90,
    'max_feasibility',
    'won',
    'Successfully awarded. Tests won status display and filtering.'
  ),
  -- Lost proposal
  (
    'e0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'Metro Station Fit-out',
    'City Rail Authority',
    '2025-09-01',
    '2026-02-28',
    600,
    NULL,
    NULL,
    15,
    'min_staff_count',
    'lost',
    'Bid unsuccessful. Tests lost status display and filtering.'
  ),
  -- Draft with estimated_hours_per_week set (not total hours)
  -- Tests the alternate code path in computeFeasibility (line 121-122)
  (
    'e0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000001',
    'Solar Farm Design',
    'Renewable Energy Co',
    '2026-06-01',
    '2026-12-31',
    NULL,
    30,
    '["b0000000-0000-0000-0000-000000000001"]'::jsonb,
    55,
    'single_office_preferred',
    'draft',
    'Uses estimated_hours_per_week=30 (not total). Tests alternate hours-per-week path in feasibility. Scoped to London office.'
  ),
  -- Draft with no dates AND no hours — triggers feasibility error
  (
    'e0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000001',
    'Green Roof Retrofit',
    'Urban Greening Initiative',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    35,
    'min_overallocation',
    'draft',
    'No dates and no hours — triggers feasibility error: must have start and end date.'
  ),
  -- Submitted proposal overlapping with engineer pending leave (March 2026)
  -- Tests feasibility degradation during high-leave period
  (
    'e0000000-0000-0000-0000-000000000008',
    'a0000000-0000-0000-0000-000000000001',
    'Tunnel Boring Assessment',
    'Metro Infrastructure Group',
    '2026-03-01',
    '2026-05-31',
    320,
    NULL,
    NULL,
    60,
    'min_overallocation',
    'submitted',
    'Starts during March when multiple staff have leave. Tests feasibility degradation during high-leave period.'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ADDITIONAL LEAVE REQUESTS
-- Covers: extended leave overlapping proposal, part-time leave, single-day leave
-- ============================================
INSERT INTO leave_requests (tenant_id, staff_id, start_date, end_date, leave_type, status)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  sp.id,
  v.start_date::date,
  v.end_date::date,
  v.leave_type,
  v.status
FROM (VALUES
  -- Extended 2-week leave for analyst in July 2026
  -- Overlaps "Airport Terminal Structural Bid" (July 2026 – Mar 2027)
  -- Tests leave deduction in computeFeasibility week-by-week loop
  ('d1000000-0000-0000-0000-000000000006', '2026-07-06', '2026-07-17', 'annual',  'approved'),
  -- Part-time staff leave (1 week) — tests leave scaled to 20h/week capacity
  ('d1000000-0000-0000-0000-000000000008', '2026-03-09', '2026-03-13', 'annual',  'approved'),
  -- Designer: single-day leave on a Monday — tests workingDaysInRange boundary
  ('d1000000-0000-0000-0000-000000000005', '2026-03-02', '2026-03-02', 'sick',    'approved'),
  -- Engineer: additional approved leave in March (overlaps Tunnel Boring Assessment)
  -- Alongside existing pending leave Mar 16-18 → two leave records in same month
  ('d1000000-0000-0000-0000-000000000004', '2026-03-23', '2026-03-27', 'annual',  'approved'),
  -- nooffice staff: pending leave (tests pending leave NOT deducted from feasibility)
  ('d1000000-0000-0000-0000-000000000009', '2026-07-20', '2026-07-24', 'annual',  'pending')
) AS v(user_id, start_date, end_date, leave_type, status)
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid;

-- ============================================
-- STAFF AVAILABILITY OVERRIDES (forecast + planner)
-- ============================================
INSERT INTO staff_availability (tenant_id, staff_id, week_start, available_hours)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  sp.id,
  v.week_start::date,
  v.available_hours
FROM (VALUES
  -- Engineer reduced capacity for training week
  ('d1000000-0000-0000-0000-000000000004', '2026-03-09', 24),
  -- Designer unavailable one week
  ('d1000000-0000-0000-0000-000000000005', '2026-03-02', 0),
  -- Analyst reduced in July overlapping proposal horizon
  ('d1000000-0000-0000-0000-000000000006', '2026-07-06', 16),
  -- Part-time staff unavailable for leave week
  ('d1000000-0000-0000-0000-000000000008', '2026-03-09', 0)
) AS v(user_id, week_start, available_hours)
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid
ON CONFLICT (staff_id, week_start) DO UPDATE SET
  available_hours = EXCLUDED.available_hours;

-- ============================================
-- SKILLS / STAFF SKILLS / PROJECT SKILL REQUIREMENTS
-- Used by hiring insights + skill shortage forecasting
-- ============================================
INSERT INTO skills (id, tenant_id, name)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Structural Analysis'),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'HVAC Design'),
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Facade Engineering'),
  ('f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Project Management'),
  ('f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'BIM Coordination')
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff_skills (staff_id, skill_id, tenant_id)
SELECT sp.id, v.skill_id::uuid, 'a0000000-0000-0000-0000-000000000001'
FROM (VALUES
  ('d1000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005'),
  ('d1000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000005'),
  ('d1000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000004')
) AS v(user_id, skill_id)
JOIN staff_profiles sp ON sp.user_id = v.user_id::uuid
ON CONFLICT (staff_id, skill_id) DO NOTHING;

INSERT INTO project_skill_requirements (project_id, skill_id, required_hours_per_week, tenant_id)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 45, 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 30, 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 35, 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000005', 28, 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000001', 52, 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000004', 22, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (project_id, skill_id) DO UPDATE SET
  required_hours_per_week = EXCLUDED.required_hours_per_week;

-- ============================================
-- INVITATIONS (admin workflow)
-- pending, accepted, and expired states for /admin/users
-- ============================================
INSERT INTO invitations (id, tenant_id, email, role, token, expires_at, accepted_at, created_by, created_at)
VALUES
  (
    'f1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'invite.pending.manager@acme.com',
    'manager',
    'seed-token-pending-manager-001',
    NOW() + INTERVAL '5 days',
    NULL,
    'd1000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '2 days'
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'invite.accepted.staff@acme.com',
    'staff',
    'seed-token-accepted-staff-001',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '4 days',
    'd1000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '10 days'
  ),
  (
    'f1000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'invite.expired.staff@acme.com',
    'staff',
    'seed-token-expired-staff-001',
    NOW() - INTERVAL '1 day',
    NULL,
    'd1000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '8 days'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SEED SUMMARY (COMPLETE)
-- ============================================
-- All test users (password: TestPassword123!):
--
--   Roles:
--     administrator: admin@acme.com
--     managers:      manager.london@acme.com, manager.singapore@acme.com
--     staff:         staff.engineer@acme.com  (overallocated: 170% total)
--                    staff.designer@acme.com
--                    staff.analyst@acme.com   (healthy utilisation)
--                    staff.new@acme.com       (no assignments, underutilised)
--                    staff.parttime@acme.com  (20h/week, overallocated: 180%)
--                    staff.nooffice@acme.com  (no office, overallocated: 180%)
--
--   Offices: London HQ, Singapore, Sydney (37.5h/wk), Dubai (empty — scope test)
--
--   Projects (13 total):
--     Active:    Bridge Design, HVAC Retrofit, Structural Assessment, MEP Design,
--                Feasibility Study, Ad-hoc Support Contract, Emergency Facade Repair,
--                Seismic Analysis, Floodplain Stress Study, Safety Audit FY2026
--     On hold:   Waterfront Survey
--     Completed: Old Warehouse Report
--     Cancelled: Airport Expansion Prelim
--
--   Project health states demonstrated:
--     on_track:    Bridge Design Phase 1
--     at_risk:     Floodplain Stress Study (95h logged / 100h estimate)
--     overrun:     Emergency Facade Repair (30h logged / 20h estimate)
--                  Seismic Analysis (101h logged / 100h estimate)
--     no_estimate: Ad-hoc Support Contract (NULL estimated_hours)
--
--   Proposals (8 total):
--     submitted: Airport Terminal Structural Bid, Tunnel Boring Assessment
--     draft:     Data Center Expansion (Sydney scope), Transit Corridor (no dates),
--                Solar Farm Design (hours_per_week path), Green Roof Retrofit (no data)
--     won:       Harbour Bridge Renewal
--     lost:      Metro Station Fit-out
--     plus varied win_probability + optimization_mode coverage
--
--   Time entry edge cases seeded:
--     0h entry, 24h entry, weekend entries (Sat+Sun), future date (Mar 2026),
--     same day split by billable flag, non-billable entries, part-time 4h/day entries
--
--   Leave requests:
--     Analyst: 2-week July leave (overlaps Airport Terminal proposal feasibility)
--     Parttime: 1-week March leave (overlaps Tunnel Boring proposal feasibility)
--     Designer: single-day Monday leave
--     Engineer: approved March leave + existing pending Mar 16-18
--     Nooffice: pending leave (should NOT reduce feasibility capacity)
--
--   Capacity planner + forecasting extras:
--     week-specific assignment overrides, staff availability overrides,
--     seeded invitations (pending/accepted/expired), skill catalog + mappings
