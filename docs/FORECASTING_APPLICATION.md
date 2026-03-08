# Forecasting Application Documentation

This document describes the current forecasting implementation for reviewers, teammates, and future maintainers.

## 1) Product Purpose

The forecasting application helps consulting firms answer a recurring planning question: "Can we deliver current and potential work with available staff capacity, and what hiring or allocation action is needed?"

In practice, it supports decisions across bid/no-bid planning, weekly staffing risk, skill bottlenecks, and near-term hiring timing.

### Primary user workflow

1. Review current and expected utilization on the dashboard.
2. Inspect skill shortages and hiring recommendations.
3. Open a proposal and run impact simulation (accept scenario).
4. Run feasibility analysis with office scope, optimization mode, and optional over-allocation.
5. Use capacity views to inspect office/staff overload by week and adjust assignments.

## 2) Core Feature Summary

### Dashboard overview

- Forecast-backed KPI and trend views use rolling weekly capacity vs project demand.
- Includes utilization trajectory, staffing risk, top forecast drivers, and action-focused panels.

### Proposal simulation

- "Simulate Accept" models the utilization impact of adding proposal demand into the forecast horizon.
- Returns current vs simulated utilization, capacity risk flag, and first overload week.

### Financial impact

- Simulation also returns expected revenue, cost, and margin using proposal hours and tenant staff rates.
- Current method uses aggregate averages (see limitations section).

### Skill shortages

- Computes per-skill average weekly demand vs available capacity over the selected forecast window.
- Returns shortage only when demand/capacity indicate a real gap.

### Hiring insights

- Produces skill hiring recommendations when demand pressure is sustained.
- Also derives utilization-based prediction messaging for overload and underutilization patterns.

### Feasibility analysis

- Evaluates whether staff in scope can absorb proposal hours week-by-week.
- Accounts for effective assignments, office filters, availability overrides, approved leave, and optimization mode.

### Capacity planning

- Staff grid view: per-person weekly assigned hours, capacity, utilization state, and assignment detail.
- Office heatmap view: office-level utilization per week, with drill-down into project/staff detail.

## 3) Canonical Data Paths

### `/api/forecast` (canonical for forecast-backed dashboard + hiring insights)

Use as the canonical source for:

- dashboard forecast aggregates
- dashboard action panel signals
- hiring insights panel data

Response includes:

- `weeks` (capacity, project hours, utilization, staffing gap, scenario demand, explanation entries)
- `skill_shortages`
- `hiring_recommendations`

### `/api/proposal-impact` (canonical for proposal simulation)

Use as the canonical source for proposal accept-scenario simulation:

- current vs simulated utilization
- capacity risk and overload week
- expected revenue/cost/margin

### Feasibility path summary (server action path)

Feasibility is currently computed through server actions, not a REST endpoint:

1. Proposal page renders feasibility UI.
2. UI triggers `computeFeasibility(...)` server action.
3. Action loads proposal, scoped staff, overlapping active projects, effective assignments, availability, and approved leave.
4. Weekly allocator applies optimization mode and returns feasibility metrics, timeline, recommended staff, and optional mode comparisons.

## 4) Core Logic Assumptions

### Proposal weekly-hours rule

- If `estimated_hours_per_week` exists, that value is used directly for overlapping weeks.
- Otherwise, `estimated_hours` is distributed across Monday-aligned proposal weeks.

### UTC week normalization

- Week boundaries are normalized to UTC.
- Monday is treated as week start and Sunday as week end across forecast/feasibility logic.

### Effective assignment semantics

- Assignment rows with `week_start` are week-specific overrides.
- Baseline assignment rows (`week_start = null`) apply unless an override exists for the same staff/project/week.
- Non-active projects are excluded from effective commitment calculations.

### Skill shortage and hiring recommendation logic

- Skill shortage: compares average weekly demand vs average weekly skill capacity across the forecast window.
- Hiring recommendation trigger: demand exceeds capacity by >20% for 4 consecutive weeks for a skill.
- Utilization-based hiring prediction signals also use threshold windows (overload, sustained high utilization, sustained underutilization).

### Feasibility committed-hours alignment

- Weekly committed hours = effective assignment hours + approved leave impact for that week.
- Achievable proposal hours are bounded by selected allocation mode and over-allocation settings.

## 5) Known Limitations / Deferred Items

### Leave harmonization

- Leave impact logic is not fully harmonized across all forecast-related paths.
- Different calculations are used between forecast-style endpoints and feasibility calculations.

### Partial-week feasibility scaling vs full-week forecast buckets

- Feasibility prorates hours for partial first/last weeks using working-day fractions.
- Forecast endpoints operate on full Monday-Sunday weekly buckets.

### Threshold policy differences

- Capacity risk and "full/overbooked" states use different thresholds across simulation, hiring, and capacity views.
- This can produce intentionally different warnings for the same underlying week.

### Pricing model limitations

- Financial simulation uses tenant-wide average billable/cost rates instead of role/staff-specific proposal staffing mix.
- Financial outputs depend on total estimated proposal hours; limited when only weekly estimates are present.

## 6) Testing Checklist

Use this checklist for regression and review sign-off.

### Dashboard

- [ ] Dashboard loads forecast weeks from `/api/forecast`.
- [ ] Utilization trend and KPI cards reflect returned values.
- [ ] Action panel shows staffing risks, skill shortages, and forecast drivers.

### Hiring insights

- [ ] Hiring Insights panel loads from `/api/forecast`.
- [ ] Skill cards show staff needed, shortage start week, and hiring window.
- [ ] Demand source details open correctly for selected skill.

### Proposal simulation

- [ ] "Simulate Accept" calls `/api/proposal-impact` and returns utilization deltas.
- [ ] Capacity risk and overload week are shown when thresholds are crossed.
- [ ] Financial impact section renders revenue/cost/margin (or null-safe placeholders).

### Feasibility

- [ ] Feasibility runs from proposal page with no API route dependency.
- [ ] Office scope filters alter staff pool and feasibility results.
- [ ] Overallocation toggle and percentage cap change achievable hours as expected.
- [ ] Weekly timeline and recommended staff update with optimization mode changes.

### Capacity views

- [ ] Capacity planner staff grid shows per-week assigned vs capacity status.
- [ ] Capacity heatmap shows office/week utilization and updates for selected horizon.
- [ ] Heatmap detail view lists projects, staff, totals, and leave impact where applicable.
