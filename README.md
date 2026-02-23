# Capacity Intelligence Platform

A multi-tenant Capacity Intelligence Platform for engineering consulting firms (100–150 staff, multi-country offices). Helps executives decide on bidding, staff utilisation, project health, and capacity forecasting.

## Tech Stack

- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, RLS)
- **Hosting**: Vercel

## Getting Started

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a project
2. Copy the project URL and anon key from Settings > API

### 2. Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

For the seed script, also add:

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Database Setup

Apply migrations via Supabase Dashboard (SQL Editor) or CLI:

```bash
# If using Supabase CLI
supabase db push
```

Or run the migration file manually: `supabase/migrations/20250223000001_initial_schema.sql`

### 4. Seed Data (Required for demo)

**Option A – Supabase CLI (local):**
```bash
supabase db reset
```
This runs migrations and `supabase/seed.sql`, creating 5 projects, staff, time entries, etc.

**Option B – Supabase Cloud:** Run `supabase/seed.sql` in the SQL Editor after applying migrations.

**Test users (password: TestPassword123!):**
- Administrator: `admin@acme.com` (can create/edit/delete projects)
- Managers: `manager.london@acme.com`, `manager.singapore@acme.com`
- Staff: `staff.engineer@acme.com`, `staff.designer@acme.com`, `staff.analyst@acme.com`, `staff.new@acme.com`

**If projects don’t appear:** Ensure the seed has run. Administrators and managers see all projects in their tenant; staff see only assigned projects.

### 5. Run Development Server

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing (redirects to dashboard when logged in) |
| `/login`, `/signup` | Auth |
| `/dashboard` | Executive dashboard |
| `/projects` | Project list |
| `/projects/new` | Add project (administrators only) |
| `/projects/[id]` | Project detail |
| `/projects/[id]/edit` | Edit project (administrators only) |
| `/staff` | Staff directory |
| `/staff/[id]` | Staff profile |
| `/capacity` | Capacity planner |
| `/time-entry` | Weekly timesheet |
| `/alerts` | Alerts list |

## Multi-Tenant

- All tables include `tenant_id`
- Row Level Security (RLS) enforces tenant isolation
- Sign up requires selecting a company (tenant)
- **Administrator**: Create and modify projects, add/remove staff from projects, change staff roles and location
- **Manager**: View staff details, progress, and all projects (no project management)
- **Staff**: View only assigned projects; cannot see billable or cost rates

## Definition of Done

- [x] Multi-tenant works
- [x] Utilisation metrics accurate
- [x] Forecasts include leave and allocations
- [x] Dashboard shows actionable insights
- [x] Alerts highlight real issues
- [x] Multi-office timezones supported
