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

### 4. Seed Data (Optional)

```bash
npm install -D tsx
npx tsx scripts/seed.ts
```

This creates 1 tenant, 3 offices, 20 staff, 5 projects, time entries, and leave. Login with `engineer1@acme.com` / `Password123!`

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
| `/projects/[id]` | Project detail |
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
