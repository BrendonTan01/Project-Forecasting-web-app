# Comprehensive Testing Guide

Work through each section in order. All scenarios are backed by data in `supabase/seed.sql`.

## Setup

```bash
supabase db reset
```

All accounts share the password: `TestPassword123!`

---

## Test Accounts Reference

| Email | Role | Office | Capacity | Notes |
|---|---|---|---|---|
| `admin@acme.com` | administrator | London | 40h/wk | Full access |
| `manager.london@acme.com` | manager | London | 40h/wk | Tenant-wide view |
| `manager.singapore@acme.com` | manager | Singapore | 40h/wk | Tenant-wide view |
| `staff.engineer@acme.com` | staff | London | 40h/wk | 170% overallocated |
| `staff.designer@acme.com` | staff | Singapore | 40h/wk | Healthy utilisation |
| `staff.analyst@acme.com` | staff | Sydney | 37.5h/wk | Healthy utilisation |
| `staff.new@acme.com` | staff | London | 40h/wk | No assignments, underutilised |
| `staff.parttime@acme.com` | staff | London | 20h/wk | 180% overallocated |
| `staff.nooffice@acme.com` | staff | (none) | 40h/wk | Excluded from office-scoped queries |

---

## Section 1 — Authentication & Role Access

| Step | Login as | Expected |
|---|---|---|
| 1.1 | `admin@acme.com` | Full nav: Dashboard, Projects, Staff, Capacity, Time Entry, Alerts, Proposals, Settings |
| 1.2 | `manager.london@acme.com` | Can view all tenant data; no user/settings management |
| 1.3 | `staff.engineer@acme.com` | Sees only own time entries and assigned projects |
| 1.4 | `staff.new@acme.com` | Staff with no assignments — projects list should be empty |
| 1.5 | `staff.nooffice@acme.com` | Appears in staff list but excluded from office-scoped capacity queries |

---

## Section 2 — Projects Page

Log in as `admin@acme.com` for all steps.

| Step | Action | Expected |
|---|---|---|
| 2.1 | Open Projects, no filter | All 12 projects visible |
| 2.2 | Filter by `active` | 9 active projects shown |
| 2.3 | Filter by `on_hold` | Only "Waterfront Survey" |
| 2.4 | Filter by `completed` | Only "Old Warehouse Report" |
| 2.5 | Filter by `cancelled` | Only "Airport Expansion Prelim" |
| 2.6 | Health badge — "Emergency Facade Repair" | **Overrun** (red) — 30h logged on 20h estimate |
| 2.7 | Health badge — "Seismic Analysis" | **At risk** (amber) — 93h logged on 100h estimate |
| 2.8 | Health badge — "Ad-hoc Support Contract" | **No estimate** (grey) — NULL estimated_hours |
| 2.9 | Health badge — "Bridge Design Phase 1" | **On track** (green) |
| 2.10 | Health badge — "Safety Audit FY2026" | **On track** (green) — 0h logged, estimate set |

---

## Section 3 — Staff & Capacity Page

Log in as `admin@acme.com`.

| Step | Action | Expected |
|---|---|---|
| 3.1 | Open Capacity page | All staff with 30/60/90-day free capacity columns |
| 3.2 | `staff.new@acme.com` row | High free capacity — no assignments, no time entries |
| 3.3 | `staff.parttime@acme.com` row | Capacity figures based on 20h/week, not 40h |
| 3.4 | `staff.engineer@acme.com` row | Near-zero or negative free capacity — 170% total allocation |
| 3.5 | `staff.nooffice@acme.com` row | Appears in tenant-wide list |
| 3.6 | `staff.analyst@acme.com` utilisation | **Healthy** band — ~37h logged against 37.5h/week capacity |
| 3.7 | Sydney office filter (if supported) | Only analyst shown; capacity uses 37.5h/week |

---

## Section 4 — Time Entry: Normal Cases

| Step | Login as | Action | Expected |
|---|---|---|---|
| 4.1 | `staff.engineer@acme.com` | Submit 8h to "Bridge Design Phase 1" | Success — assigned to project |
| 4.2 | `staff.engineer@acme.com` | Submit 8h to "HVAC Retrofit Study" | Success — assigned to project |
| 4.3 | `manager.london@acme.com` | Submit time to any project | Success — managers bypass assignment check |
| 4.4 | `admin@acme.com` | Submit time to any project | Success — admin bypasses assignment check |
| 4.5 | `staff.analyst@acme.com` | Submit non-billable 2h to "Structural Assessment" | Success; appears with non-billable indicator |

---

## Section 5 — Time Entry: Edge Cases & Validation

| Step | Login as | Action | Expected |
|---|---|---|---|
| 5.1 | `staff.engineer@acme.com` | Submit time to "Seismic Analysis" (not assigned) | **Rejected** — "Staff must be assigned to project" |
| 5.2 | `staff.engineer@acme.com` | Submit **0 hours** to an assigned project | DB allows (CHECK `>= 0`); verify UI behaviour (may show warning) |
| 5.3 | `staff.engineer@acme.com` | Submit **24 hours** to an assigned project | Success — maximum allowed boundary |
| 5.4 | `staff.engineer@acme.com` | Submit **24.01 hours** | **Rejected** — violates `CHECK hours <= 24` |
| 5.5 | `staff.engineer@acme.com` | Submit entry on a **Saturday** (e.g. 2026-03-07) | DB allows; verify it appears correctly in UI |
| 5.6 | `staff.engineer@acme.com` | Submit entry for a **future date** (e.g. 2026-04-01) | DB allows; verify UI display |
| 5.7 | `staff.engineer@acme.com` | Submit two separate entries on the **same day** for the same project | DB allows multiple rows; both should appear in the list |
| 5.8 | `staff.engineer@acme.com` | Edit `staff.designer@acme.com`'s time entry | **Rejected** — ownership check |
| 5.9 | `manager.london@acme.com` | Edit any staff member's time entry | Success — managers can edit tenant-wide entries |
| 5.10 | View seeded 0h entry | Open time entry list as admin | 0h entry visible, no crash |
| 5.11 | View seeded 24h entry | Open time entry list as admin | 24h entry visible, no crash |
| 5.12 | View seeded weekend entries | Open time entry list as admin | Saturday (2026-02-21) and Sunday (2026-02-22) entries visible |
| 5.13 | View seeded future entry | Open time entry list as admin | 2026-03-05 future entry visible |
| 5.14 | View seeded duplicate same-day | Filter by engineer + 2026-02-23 | Two separate 4h entries for Bridge Design both visible |

---

## Section 6 — Proposals Page

Log in as `admin@acme.com`.

| Step | Action | Expected |
|---|---|---|
| 6.1 | Open Proposals | All 8 proposals visible |
| 6.2 | Check status badges | `draft`, `submitted`, `won`, `lost` all present |
| 6.3 | Filter by `won` | Only "Harbour Bridge Renewal" |
| 6.4 | Filter by `lost` | Only "Metro Station Fit-out" |
| 6.5 | Filter by `submitted` | "Airport Terminal Structural Bid" and "Tunnel Boring Assessment" |
| 6.6 | Open "Transit Corridor Preliminary Design" | Completeness warning — no dates, no hours |
| 6.7 | Open "Green Roof Retrofit" | Completeness warning — no dates and no hours |
| 6.8 | Open "Solar Farm Design" | Shows `estimated_hours_per_week = 30`, no total hours |

---

## Section 7 — Feasibility Analysis (Capacity Prediction)

Log in as `admin@acme.com` for all steps.

### 7.1 — Leave deduction path

Open **"Airport Terminal Structural Bid"** (Jul 2026 – Mar 2027).

| Sub-step | Action | Expected |
|---|---|---|
| 7.1.1 | Run feasibility, all offices | Feasibility % calculated; week-by-week table shown |
| 7.1.2 | Inspect weeks of 6 Jul – 17 Jul 2026 | Reduced free capacity for `staff.analyst@acme.com` — 2-week approved leave |
| 7.1.3 | Run feasibility, London office only | Different staff pool (analyst excluded); different % |
| 7.1.4 | Run feasibility, Singapore office only | Only designer visible in pool |

### 7.2 — `estimated_hours_per_week` code path

Open **"Solar Farm Design"** (Jun–Dec 2026, `estimated_hours_per_week = 30`).

| Sub-step | Action | Expected |
|---|---|---|
| 7.2.1 | Run feasibility | Uses per-week figure directly (not total ÷ weeks) — verify required hours per week = 30 × week fraction |
| 7.2.2 | Office scope pre-set to London | Only London staff in pool |

### 7.3 — Missing-data error paths

| Sub-step | Proposal | Action | Expected |
|---|---|---|---|
| 7.3.1 | "Green Roof Retrofit" | Run feasibility | **Error**: "Proposal must have a start and end date" |
| 7.3.2 | "Transit Corridor Preliminary Design" | Run feasibility | **Error**: "Proposal must have a start and end date" (no dates seeded) |

### 7.4 — Leave-degraded feasibility

Open **"Tunnel Boring Assessment"** (Mar–May 2026).

| Sub-step | Action | Expected |
|---|---|---|
| 7.4.1 | Run feasibility, all offices | Weeks of Mar 9–13 (parttime leave) and Mar 23–27 (engineer leave) show reduced free capacity |
| 7.4.2 | Enable overallocation toggle | Achievable hours increase; overallocated staff names listed |

### 7.5 — Overallocation toggle

Open any proposal with a long date range.

| Sub-step | Action | Expected |
|---|---|---|
| 7.5.1 | Run feasibility, overallocation OFF | Free capacity capped at 100% per staff |
| 7.5.2 | Run feasibility, overallocation ON (120%) | Achievable hours increase; staff working >100% listed by name |

### 7.6 — Office scope filtering

Open **"Data Center Expansion Proposal"** (pre-scoped to Sydney).

| Sub-step | Action | Expected |
|---|---|---|
| 7.6.1 | Run feasibility | Only analyst (Sydney, 37.5h/wk) in pool; capacity reflects 37.5h |
| 7.6.2 | Change scope to Dubai office | **Error**: "No staff found for the selected offices" |

---

## Section 8 — Alerts & Dashboard Warnings

Log in as `admin@acme.com`.

| Step | Action | Expected |
|---|---|---|
| 8.1 | Open Dashboard / Alerts | Project overrun/at-risk warnings visible |
| 8.2 | "Emergency Facade Repair" alert | **Overrun** — 30h on 20h estimate |
| 8.3 | "Seismic Analysis" alert | **At risk** — 93h on 100h estimate |
| 8.4 | Staff overallocation alerts | `staff.engineer@acme.com` (170%), `staff.parttime@acme.com` (180%), `staff.nooffice@acme.com` (180%) |
| 8.5 | Proposal completeness warnings | "Green Roof Retrofit" and "Transit Corridor" flagged |

---

## Section 9 — Leave Requests

Log in as `admin@acme.com`.

| Step | Action | Expected |
|---|---|---|
| 9.1 | View all leave requests | All statuses present: `pending`, `approved`, `rejected` |
| 9.2 | Check analyst's July leave | 2-week approved block (Jul 6–17, 2026) visible |
| 9.3 | Check parttime's March leave | 1-week approved block (Mar 9–13, 2026) visible |
| 9.4 | Check designer's single-day leave | 1-day approved (Mar 2, 2026 — a Monday) |
| 9.5 | Check nooffice pending leave | Jul 20–24 leave with status `pending` — should NOT reduce feasibility capacity |
| 9.6 | Approve engineer's pending leave (Mar 16–18) | Status changes to `approved` |
| 9.7 | Re-run feasibility for "Tunnel Boring Assessment" | Feasibility % drops for week of Mar 16 now that leave is approved |
| 9.8 | Open Capacity page after approving leave | Free capacity for engineer decreases in the 30-day view |

---

## Section 10 — Settings & Multi-tenant Isolation

Log in as `admin@acme.com`.

| Step | Action | Expected |
|---|---|---|
| 10.1 | Open Settings | Can manage offices and users |
| 10.2 | Check offices list | 4 offices: London, Singapore, Sydney (37.5h), Dubai (empty) |
| 10.3 | Check Sydney office hours | `weekly_working_hours = 37.5` — reflected in analyst capacity |
| 10.4 | Log in as `staff.engineer@acme.com`, attempt to open Settings | Redirected or access denied |
| 10.5 | Direct API call with wrong tenant context | RLS returns empty result set — tenant isolation enforced |

---

## Quick Verification Queries (Supabase SQL Editor)

```sql
-- Confirm project health states
SELECT name, estimated_hours,
  COALESCE(SUM(te.hours), 0) AS actual_hours,
  CASE
    WHEN estimated_hours IS NULL OR estimated_hours = 0 THEN 'no_estimate'
    WHEN COALESCE(SUM(te.hours), 0) > estimated_hours       THEN 'overrun'
    WHEN COALESCE(SUM(te.hours), 0) > estimated_hours * 0.9 THEN 'at_risk'
    ELSE 'on_track'
  END AS health
FROM projects p
LEFT JOIN time_entries te ON te.project_id = p.id
WHERE p.tenant_id = 'a0000000-0000-0000-0000-000000000001'
GROUP BY p.id, p.name, p.estimated_hours
ORDER BY p.name;

-- Confirm staff overallocation
SELECT u.email,
  ROUND(SUM(pa.allocation_percentage), 0) AS total_allocation_pct
FROM project_assignments pa
JOIN staff_profiles sp ON sp.id = pa.staff_id
JOIN public.users u ON u.id = sp.user_id
GROUP BY u.email
ORDER BY total_allocation_pct DESC;

-- Confirm leave request coverage
SELECT u.email, lr.start_date, lr.end_date, lr.leave_type, lr.status
FROM leave_requests lr
JOIN staff_profiles sp ON sp.id = lr.staff_id
JOIN public.users u ON u.id = sp.user_id
ORDER BY lr.start_date;

-- Confirm proposal statuses and hours fields
SELECT name, status, estimated_hours, estimated_hours_per_week,
  proposed_start_date, proposed_end_date
FROM project_proposals
WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
ORDER BY status, name;

-- Confirm edge-case time entries
SELECT u.email, p.name, te.date, te.hours, te.billable_flag
FROM time_entries te
JOIN staff_profiles sp ON sp.id = te.staff_id
JOIN public.users u ON u.id = sp.user_id
JOIN projects p ON p.id = te.project_id
WHERE te.hours = 0 OR te.hours = 24
   OR te.date > CURRENT_DATE
   OR EXTRACT(DOW FROM te.date) IN (0, 6)
ORDER BY te.hours DESC, te.date;
```
