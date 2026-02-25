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
    crypt('TestPassword123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"administrator","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Managing Director","weekly_capacity_hours":40,"billable_rate":250,"cost_rate":120}'::jsonb,
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
    crypt('TestPassword123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"manager","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Project Manager","weekly_capacity_hours":40,"billable_rate":180,"cost_rate":95}'::jsonb,
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
    crypt('TestPassword123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"manager","office_id":"b0000000-0000-0000-0000-000000000002","job_title":"Regional Manager","weekly_capacity_hours":40,"billable_rate":200,"cost_rate":100}'::jsonb,
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
    crypt('TestPassword123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Senior Engineer","weekly_capacity_hours":40,"billable_rate":150,"cost_rate":75}'::jsonb,
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
    crypt('TestPassword123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","office_id":"b0000000-0000-0000-0000-000000000002","job_title":"Design Engineer","weekly_capacity_hours":40,"billable_rate":130,"cost_rate":65}'::jsonb,
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
    crypt('TestPassword123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","office_id":"b0000000-0000-0000-0000-000000000003","job_title":"Structural Analyst","weekly_capacity_hours":37.5,"billable_rate":140,"cost_rate":70}'::jsonb,
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
    crypt('TestPassword123!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"tenant_id":"a0000000-0000-0000-0000-000000000001","role":"staff","office_id":"b0000000-0000-0000-0000-000000000001","job_title":"Junior Engineer","weekly_capacity_hours":40,"billable_rate":90,"cost_rate":45}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

-- ============================================
-- PUBLIC USERS + STAFF_PROFILES (from auth.users)
-- The handle_new_user trigger may not fire on direct auth.users INSERT in seed.
-- Explicitly populate to ensure tenant_id/role exist for RLS (get_tenant_id, is_manager_or_exec).
-- ============================================
INSERT INTO public.users (id, tenant_id, email, role, office_id)
SELECT
  id,
  (raw_user_meta_data->>'tenant_id')::uuid,
  email,
  COALESCE(NULLIF(TRIM(raw_user_meta_data->>'role'), ''), 'staff'),
  (raw_user_meta_data->>'office_id')::uuid
FROM auth.users
WHERE email LIKE '%@acme.com'
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  office_id = EXCLUDED.office_id;

INSERT INTO public.staff_profiles (user_id, tenant_id, job_title, weekly_capacity_hours, billable_rate, cost_rate)
SELECT
  id,
  (raw_user_meta_data->>'tenant_id')::uuid,
  NULLIF(TRIM(raw_user_meta_data->>'job_title'), ''),
  COALESCE((raw_user_meta_data->>'weekly_capacity_hours')::numeric, 40),
  NULLIF((raw_user_meta_data->>'billable_rate')::numeric, 0),
  NULLIF((raw_user_meta_data->>'cost_rate')::numeric, 0)
FROM auth.users
WHERE email LIKE '%@acme.com'
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
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
  uuid_generate_v4(),
  id,
  id,
  format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
  'email',
  NOW(),
  NOW()
FROM auth.users
WHERE email LIKE '%@acme.com';

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
-- ============================================
INSERT INTO project_proposals (
  id,
  tenant_id,
  name,
  client_name,
  proposed_start_date,
  proposed_end_date,
  estimated_hours,
  expected_revenue,
  manual_estimated_cost,
  derived_estimated_cost_override,
  risk_allowance_amount,
  win_probability_percent,
  schedule_confidence_percent,
  cross_office_dependency_percent,
  client_quality_score,
  cost_source_preference,
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
    1800000,
    1250000,
    NULL,
    120000,
    62,
    74,
    58,
    82,
    'manual_first',
    'submitted',
    'Cross-office delivery between London and Singapore.'
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Data Center Expansion Proposal',
    'CloudScale Partners',
    '2026-09-01',
    '2027-06-30',
    2200,
    2900000,
    NULL,
    1680000,
    200000,
    48,
    66,
    72,
    76,
    'derived_first',
    'draft',
    'Higher hand-off risk due to Sydney specialist coverage.'
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Transit Corridor Preliminary Design',
    'Metro Transport Office',
    '2026-10-15',
    '2027-02-28',
    NULL,
    950000,
    NULL,
    NULL,
    NULL,
    NULL,
    52,
    NULL,
    68,
    'manual_first',
    'draft',
    'Intentionally partial inputs to test completeness warnings.'
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
-- SEED SUMMARY
-- ============================================
-- Test users (password: TestPassword123!):
--   administrator: admin@acme.com
--   managers:      manager.london@acme.com, manager.singapore@acme.com
--   staff:         staff.engineer@acme.com, staff.designer@acme.com, staff.analyst@acme.com, staff.new@acme.com
--
-- Features covered:
--   - All 3 roles (administrator, manager, staff)
--   - Multi-office (London, Singapore, Sydney)
--   - Project assignments with varying allocations
--   - Time entries (billable and non-billable)
--   - Leave requests (pending, approved, rejected)
--   - Staff with no project assignments (staff.new@acme.com)
--   - Proposal pipeline with complete and partial bid inputs
