# End-to-End Testing Guide (Role-Based)

This guide is built around real day-to-day workflows for all 3 roles:

- `administrator` (admin operations, governance, cross-office planning)
- `manager` (delivery planning and staffing adjustments)
- `staff` (time entry, leave, and personal visibility)

All scenarios assume seeded data from `supabase/seed.sql`.

## 1) Test Setup

Run a full reset:

```bash
supabase db reset
```

All seeded users use:

- Password: `TestPassword123!`

Primary seeded accounts:

- `admin@acme.com` (administrator, London)
- `manager.london@acme.com` (manager, London)
- `manager.singapore@acme.com` (manager, Singapore)
- `staff.engineer@acme.com` (staff, London)
- `staff.designer@acme.com` (staff, Singapore)
- `staff.analyst@acme.com` (staff, Sydney)
- `staff.new@acme.com` (staff, London, no assignments)
- `staff.parttime@acme.com` (staff, London, 20h/week)
- `staff.nooffice@acme.com` (staff, no office)

## 1.5) Quick Smoke Test (10-15 minutes)

Use this for a fast confidence pass before running the full guide.

1. Log in as `admin@acme.com`.
   - Open `/admin/users`: confirm users list loads and invitation sections show pending + accepted + expired.
2. Open `/projects`.
   - Confirm health coverage is visible:
     - `Emergency Facade Repair` = overrun
     - `Seismic Analysis` = overrun
     - `Floodplain Stress Study` = at-risk
     - `Ad-hoc Support Contract` = no-estimate
3. Open `/capacity-planner` -> `Staff assignments`.
   - Drag one assignment and choose "Move only this week".
   - Refresh and confirm move persisted.
4. Open `/proposals`, then open `Airport Terminal Structural Bid`.
   - Run feasibility once and confirm it returns results (not an error).
5. Open `/hiring-insights`.
   - Confirm recommendation cards load (or explicit empty-state appears without errors).
6. Log out, then log in as `manager.london@acme.com`.
   - Confirm manager can open `/projects` and `/capacity-planner`.
   - Confirm manager cannot access `/admin/users`.
7. Log out, then log in as `staff.engineer@acme.com`.
   - Confirm staff cannot open `/proposals` or `/capacity-planner`.
   - In `/time-entry`, add one billable entry on an assigned project/day, then add non-billable on same day/project.
   - Confirm both buckets are handled correctly.

If all 7 steps pass, proceed to full end-to-end workflow tests below.

## 2) Seed Sanity Checks (Quick)

Before UI testing, confirm baseline in SQL editor:

```sql
-- Project and proposal counts
SELECT 'projects' AS item, COUNT(*) FROM projects
UNION ALL
SELECT 'proposals', COUNT(*) FROM project_proposals
UNION ALL
SELECT 'skills', COUNT(*) FROM skills
UNION ALL
SELECT 'invitations', COUNT(*) FROM invitations;

-- Weekly assignment overrides exist
SELECT project_id, staff_id, week_start, weekly_hours_allocated
FROM project_assignments
WHERE week_start IS NOT NULL
ORDER BY week_start, staff_id;

-- Same project/day split by billable bucket (now valid under latest unique constraint)
SELECT staff_id, project_id, date, billable_flag, hours
FROM time_entries
WHERE date = '2026-02-23'
ORDER BY staff_id, billable_flag;
```

Expected:

- non-zero counts for proposals, skills, invitations
- week-specific assignment rows present
- `2026-02-23` includes both billable and non-billable rows for same staff/project

## 3) Administrator Workflow

Log in as `admin@acme.com`.

### 3.1 Admin operations and user governance

1. Open `/admin`.
   - Verify cards show Total users, Active projects, Pending leave requests, Pending invitations.
2. Open `/admin/users`.
   - Verify users table loads.
   - Verify invitation sections include:
     - one pending invite
     - one accepted invite
     - one expired invite
3. In "Invite a user", create a new invite with role `staff`.
   - Expected: success panel with invite URL.
4. Revoke that new invite.
   - Expected: invite removed from pending list.

### 3.2 Project and assignment governance

1. Open `/projects`, filter by each status (`active`, `on_hold`, `completed`, `cancelled`).
2. Open `Emergency Facade Repair`.
   - Expected health: overrun.
3. Open `Seismic Analysis`.
   - Expected health: overrun.
4. Open `Floodplain Stress Study`.
   - Expected health: at-risk.
5. Open `Ad-hoc Support Contract`.
   - Expected health: no-estimate.
6. Open a project detail and click "Manage assignments".
   - Add/remove one assignment, save.
   - Expected: project detail assigned hours update.

### 3.3 Capacity planner and forecast behavior

1. Open `/capacity-planner` -> `Staff assignments` tab.
2. Pick a visible assignment card and drag it:
   - first test "Move only this week"
   - second test "Move this and all future weeks"
3. Refresh and verify moved work persists in destination staff/week cells.
4. Confirm color semantics remain correct:
   - green `<80%`
   - amber `80-100%`
   - red `>100%`

### 3.4 Skills and hiring signal validation

1. Open `/settings/skills`.
   - Verify skill catalog preloaded (Structural Analysis, HVAC Design, etc).
2. Open a project detail -> Skill requirements card.
   - Modify one required hours/week value and save.
3. Open a staff profile -> Skills card.
   - Add/remove one skill and save.
4. Open `/hiring-insights`.
   - Expected: recommendations reflect seeded demand pressure and demand source projects.

### 3.5 Proposal simulation and feasibility

1. Open `/proposals`.
   - Verify all statuses exist: `draft`, `submitted`, `won`, `lost`.
2. Open `Airport Terminal Structural Bid`.
   - Run feasibility and inspect July weeks.
   - Expected: reduced capacity where approved leave/availability overrides exist.
3. Open `Solar Farm Design`.
   - Expected: hours-per-week path used (`estimated_hours_per_week` present).
4. Open `Green Roof Retrofit`.
   - Run feasibility.
   - Expected: missing date validation error.
5. Toggle optimization mode and office scope; rerun.
   - Expected: different recommended staffing and feasibility outcomes.

### 3.6 Leave management

1. Open `/leave`.
2. Approve one pending leave request.
3. Re-open related proposal feasibility.
   - Expected: capacity/feasibility changes in overlapping weeks.

## 4) Manager Workflow

Log in as `manager.london@acme.com`.

### 4.1 Access boundary checks

1. Verify manager can access:
   - `/projects`, `/proposals`, `/capacity`, `/capacity-planner`, `/leave`, `/time-entry`, `/settings`
2. Verify manager cannot access admin-only pages:
   - `/admin`, `/admin/users`, `/admin/offices`, `/admin/settings`
   - Expected: redirect or denied access UX.

### 4.2 Delivery planning actions

1. In `/projects`, create or edit a project.
2. In a project detail, manage assignments.
3. In `/capacity-planner`, perform one drag/drop reassignment.
4. In `/proposals`, create or edit a proposal.
5. In a proposal detail, run feasibility with at least 2 optimization modes.

Expected: managers can perform these operations without permission errors.

### 4.3 Staff rate governance (new policy behavior)

1. Open `/settings` and use rate manager.
2. Edit own rates.
   - Expected: success.
3. Edit a London staff member's rates (same office, role staff).
   - Expected: success.
4. Attempt to edit:
   - non-London staff rates, or
   - a manager/administrator rate other than self.
   - Expected: update blocked by policy.

### 4.4 Leave and time-entry supervisory behavior

1. In `/leave`, approve/reject pending requests.
2. In `/time-entry`, switch selected staff in the staff dropdown.
3. Create/edit/delete an entry for another staff member.
   - Expected: manager can operate tenant-wide.

## 5) Staff Workflow

Log in as `staff.engineer@acme.com`.

### 5.1 Navigation and visibility restrictions

1. Confirm staff cannot access:
   - `/proposals`
   - `/capacity`
   - `/capacity-planner`
2. Confirm staff can access:
   - `/dashboard`, `/projects` (assigned only), `/time-entry`, `/leave`, `/settings`

### 5.2 Time-entry workflow (latest constraints)

1. Log 4h billable for an assigned project/day.
2. Log 2h additional billable on same project/day.
   - Expected: merged into same billable bucket row.
3. Log 3h non-billable on same project/day.
   - Expected: separate row by billable flag (allowed).
4. Attempt >24 combined project/day hours across billable + non-billable.
   - Expected: blocked with combined-hours error.
5. Attempt to log time to an unassigned project.
   - Expected: blocked ("must be assigned").

### 5.3 Leave and profile workflow

1. Open `/leave` and submit a leave request.
2. Verify new request appears in "My requests" as pending.
3. Delete pending request.
   - Expected: removed successfully.
4. Open `/settings`.
   - Verify staff cannot manage global rates or skill catalog.

## 6) Cross-Role Regression Checklist

Run these after completing all role flows:

- Assignment drag/drop changes are visible in capacity planner and reflected in forecast-driven pages.
- Proposal feasibility output changes when:
  - office scope changes
  - optimization mode changes
  - leave status/capacity overrides change.
- Project health badges are consistent with seeded actual vs estimated hours.
- Invitations page correctly separates pending, accepted, expired.
- Skill edits (catalog + mapping + project requirements) propagate to hiring insights recommendations.

## 7) Known Intentional Seed Cases

These are intentional and should not be treated as bugs:

- same project/day entries split by `billable_flag`
- part-time staff (`20h/week`) over-allocation scenarios
- staff with no office for office-scope exclusion tests
- proposals with missing fields to exercise validation/error paths
- week-specific assignment override rows for planner move-scope behavior
