"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";

export type WeekFeasibility = {
  weekStart: string; // ISO date (Monday)
  weekEnd: string;   // ISO date (Sunday)
  requiredHours: number;
  achievableHours: number;
  totalFreeCapacity: number;
  overallocatedStaffCount: number;
  activeProjectCount: number;
};

export type FeasibilityResult = {
  weeks: WeekFeasibility[];
  totalRequired: number;
  totalAchievable: number;
  feasibilityPercent: number;
  staffCount: number;
  officeNames: string[];
  error?: never;
};

export type FeasibilityError = {
  error: string;
};

// Returns the Monday of the week containing the given date
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Number of working days (Mon–Fri) in [start, end] inclusive
function workingDaysInRange(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  cur.setUTCHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setUTCHours(0, 0, 0, 0);
  while (cur <= endCopy) {
    const dow = cur.getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

// Leave hours for a staff member within a given week [weekStart, weekEnd]
function leaveHoursInWeek(
  leaves: Array<{ staff_id: string; start_date: string; end_date: string }>,
  staffId: string,
  weekStart: Date,
  weekEnd: Date,
  dailyCapacity: number
): number {
  const weekEndFri = new Date(weekEnd);
  // weekEnd is Sunday; cap to Friday
  weekEndFri.setUTCDate(weekEnd.getUTCDate() - 2);

  let leaveDays = 0;
  for (const lr of leaves) {
    if (lr.staff_id !== staffId) continue;
    const ls = new Date(lr.start_date + "T00:00:00Z");
    const le = new Date(lr.end_date + "T00:00:00Z");
    // Intersect [ls, le] with [weekStart, weekEndFri]
    const overlapStart = ls > weekStart ? ls : weekStart;
    const overlapEnd = le < weekEndFri ? le : weekEndFri;
    if (overlapStart <= overlapEnd) {
      leaveDays += workingDaysInRange(overlapStart, overlapEnd);
    }
  }
  return leaveDays * dailyCapacity;
}

export async function computeFeasibility(
  proposalId: string,
  officeIds: string[] | null,
  allowOverallocation: boolean
): Promise<FeasibilityResult | FeasibilityError> {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };

  const supabase = await createClient();

  // 1. Fetch the proposal
  const { data: proposal, error: proposalError } = await supabase
    .from("project_proposals")
    .select("proposed_start_date, proposed_end_date, estimated_hours, estimated_hours_per_week")
    .eq("id", proposalId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (proposalError || !proposal) return { error: "Proposal not found" };
  if (!proposal.proposed_start_date || !proposal.proposed_end_date) {
    return { error: "Proposal must have a start and end date for feasibility analysis" };
  }

  const propStart = new Date(proposal.proposed_start_date + "T00:00:00Z");
  const propEnd = new Date(proposal.proposed_end_date + "T00:00:00Z");

  if (propEnd < propStart) return { error: "End date is before start date" };

  // Derive hours per week
  const totalDays = (propEnd.getTime() - propStart.getTime()) / (1000 * 60 * 60 * 24);
  const totalWeeks = Math.max(totalDays / 7, 0);

  let hoursPerWeek: number;
  if (proposal.estimated_hours_per_week) {
    hoursPerWeek = Number(proposal.estimated_hours_per_week);
  } else if (proposal.estimated_hours && totalWeeks > 0) {
    hoursPerWeek = Number(proposal.estimated_hours) / totalWeeks;
  } else {
    return { error: "Proposal must have an hours estimate for feasibility analysis" };
  }

  // 2. Fetch staff in selected offices (or all tenant staff)
  let staffQuery = supabase
    .from("staff_profiles")
    .select("id, weekly_capacity_hours, user_id, users!inner(office_id, offices(id, name))")
    .eq("tenant_id", user.tenantId);

  if (officeIds && officeIds.length > 0) {
    staffQuery = staffQuery.in("users.office_id", officeIds);
  }

  const { data: staffRows } = await staffQuery;
  const staff = staffRows ?? [];

  if (staff.length === 0) {
    return { error: "No staff found for the selected offices" };
  }

  const staffIds = staff.map((s) => s.id);

  // Collect office names for display
  const officeNameSet = new Set<string>();
  for (const s of staff) {
    const officeName = (s.users as { offices?: { name?: string } | null })?.offices?.name;
    if (officeName) officeNameSet.add(officeName);
  }

  // 3. Fetch all active projects overlapping the proposal period
  const { data: overlappingProjects } = await supabase
    .from("projects")
    .select("id, start_date, end_date")
    .eq("tenant_id", user.tenantId)
    .eq("status", "active")
    .lte("start_date", proposal.proposed_end_date)
    .gte("end_date", proposal.proposed_start_date);

  const projectIds = (overlappingProjects ?? []).map((p) => p.id);

  // 4. Fetch assignments for those projects that involve our staff
  const { data: assignmentRows } = projectIds.length > 0
    ? await supabase
        .from("project_assignments")
        .select("staff_id, allocation_percentage, project_id")
        .in("project_id", projectIds)
        .in("staff_id", staffIds)
    : { data: [] };

  const assignments = assignmentRows ?? [];

  // Build lookup: projectId -> { start_date, end_date }
  const projectDates: Record<string, { start: Date; end: Date }> = {};
  for (const p of overlappingProjects ?? []) {
    if (p.start_date && p.end_date) {
      projectDates[p.id] = {
        start: new Date(p.start_date + "T00:00:00Z"),
        end: new Date(p.end_date + "T00:00:00Z"),
      };
    }
  }

  // 5. Fetch approved leave for relevant staff during the proposal period
  const { data: leaveRows } = await supabase
    .from("leave_requests")
    .select("staff_id, start_date, end_date")
    .eq("tenant_id", user.tenantId)
    .eq("status", "approved")
    .in("staff_id", staffIds)
    .lte("start_date", proposal.proposed_end_date)
    .gte("end_date", proposal.proposed_start_date);

  const leaves = leaveRows ?? [];

  // 6. Generate week-by-week analysis
  const weeks: WeekFeasibility[] = [];
  const firstMonday = getMondayOf(propStart);
  let weekCursor = new Date(firstMonday);

  while (weekCursor <= propEnd) {
    const weekStart = new Date(weekCursor);
    const weekEnd = new Date(weekCursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); // Sunday

    // Clamp to proposal bounds for partial weeks
    const clampStart = weekStart < propStart ? propStart : weekStart;
    const clampEnd = weekEnd > propEnd ? propEnd : weekEnd;

    // Working days in this (potentially partial) week
    const workDays = workingDaysInRange(clampStart, clampEnd);
    const weekFraction = workDays / 5; // 5 working days in a full week

    const requiredHours = hoursPerWeek * weekFraction;

    let totalFreeCapacity = 0;
    let overallocatedCount = 0;

    for (const sp of staff) {
      const weeklyCapacity = Number(sp.weekly_capacity_hours);
      const dailyCapacity = weeklyCapacity / 5;
      const effectiveCapacity = weeklyCapacity * weekFraction;

      // Sum up allocated hours from overlapping projects this week
      let allocatedHours = 0;
      for (const a of assignments) {
        if (a.staff_id !== sp.id) continue;
        const pd = projectDates[a.project_id];
        if (!pd) continue;
        // Check if this project overlaps this week
        if (pd.start > weekEnd || pd.end < weekStart) continue;
        allocatedHours += (Number(a.allocation_percentage) / 100) * weeklyCapacity * weekFraction;
      }

      // Subtract leave
      const leaveHrs = leaveHoursInWeek(leaves, sp.id, weekStart, weekEnd, dailyCapacity);
      const committedHours = allocatedHours + leaveHrs;

      const rawFree = effectiveCapacity - committedHours;

      if (allowOverallocation) {
        // Allow staff to go over; still pool whatever capacity they have
        totalFreeCapacity += effectiveCapacity;
        if (committedHours > effectiveCapacity) overallocatedCount++;
      } else {
        const free = Math.max(0, rawFree);
        totalFreeCapacity += free;
        if (committedHours > effectiveCapacity) overallocatedCount++;
      }
    }

    const achievableHours = allowOverallocation
      ? requiredHours // Can always achieve with overallocation
      : Math.min(requiredHours, totalFreeCapacity);

    // Count distinct active projects overlapping this week
    const activeProjectCount = (overlappingProjects ?? []).filter((p) => {
      const pd = projectDates[p.id];
      return pd && pd.start <= weekEnd && pd.end >= weekStart;
    }).length;

    weeks.push({
      weekStart: toISODate(weekStart),
      weekEnd: toISODate(weekEnd),
      requiredHours: Math.round(requiredHours * 10) / 10,
      achievableHours: Math.round(achievableHours * 10) / 10,
      totalFreeCapacity: Math.round(totalFreeCapacity * 10) / 10,
      overallocatedStaffCount: overallocatedCount,
      activeProjectCount,
    });

    weekCursor.setUTCDate(weekCursor.getUTCDate() + 7);
  }

  const totalRequired = weeks.reduce((s, w) => s + w.requiredHours, 0);
  const totalAchievable = weeks.reduce((s, w) => s + w.achievableHours, 0);
  const feasibilityPercent =
    totalRequired > 0 ? Math.round((totalAchievable / totalRequired) * 1000) / 10 : 100;

  return {
    weeks,
    totalRequired: Math.round(totalRequired * 10) / 10,
    totalAchievable: Math.round(totalAchievable * 10) / 10,
    feasibilityPercent,
    staffCount: staff.length,
    officeNames: Array.from(officeNameSet).sort(),
  };
}
