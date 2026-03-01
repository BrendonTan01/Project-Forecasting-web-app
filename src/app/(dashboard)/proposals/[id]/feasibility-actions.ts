"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import {
  PROPOSAL_OPTIMIZATION_COMPARISON_MODES,
  PROPOSAL_OPTIMIZATION_MODE_LABELS,
  normalizeProposalOptimizationMode,
  type ProposalOptimizationMode,
} from "../optimization-modes";
import { allocateForMode, type StaffCapacitySlice } from "../feasibility-optimizer";

export type WeekFeasibility = {
  weekStart: string; // ISO date (Monday)
  weekEnd: string;   // ISO date (Sunday)
  requiredHours: number;
  achievableHours: number;
  totalFreeCapacity: number;
  allocatedStaffCount: number;
  overallocatedStaffCount: number;
  overallocatedStaff: string[];
  overallocatedHours: number;
  activeProjectCount: number;
};

export type FeasibilityComparison = {
  mode: ProposalOptimizationMode;
  label: string;
  feasibilityPercent: number;
  totalRequired: number;
  totalAchievable: number;
  staffUsedCount: number;
  overallocatedStaffCount: number;
  overallocatedHours: number;
};

export type FeasibilityResult = {
  optimizationMode: ProposalOptimizationMode;
  optimizationLabel: string;
  weeks: WeekFeasibility[];
  totalRequired: number;
  totalAchievable: number;
  feasibilityPercent: number;
  staffUsedCount: number;
  totalOverallocatedHours: number;
  staffCount: number;
  recommendedStaff: Array<{
    id: string;
    name: string;
    role: string;
    office: string;
  }>;
  officeNames: string[];
  comparisons?: FeasibilityComparison[];
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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

type FeasibilityBaseData = {
  proposal: {
    proposed_start_date: string;
    proposed_end_date: string;
    estimated_hours: number | null;
    estimated_hours_per_week: number | null;
    optimization_mode: ProposalOptimizationMode | null;
  };
  staff: Array<{
    id: string;
    weeklyCapacityHours: number;
    email: string;
    role: string;
    office: string;
    officeId: string | null;
  }>;
  overlappingProjects: Array<{ id: string; start_date: string | null; end_date: string | null }>;
  assignments: Array<{ staff_id: string; allocation_percentage: number; project_id: string }>;
  leaves: Array<{ staff_id: string; start_date: string; end_date: string }>;
  officeNames: string[];
};

function parseOfficeIdsKey(officeIdsKey: string): string[] {
  if (!officeIdsKey) return [];
  return officeIdsKey.split(",").filter(Boolean);
}

async function getFeasibilityBaseData(
  tenantId: string,
  proposalId: string,
  officeIdsKey: string
): Promise<FeasibilityBaseData | FeasibilityError> {
  const supabase = await createClient();
  const officeIds = parseOfficeIdsKey(officeIdsKey);

    const { data: proposal, error: proposalError } = await supabase
      .from("project_proposals")
      .select("proposed_start_date, proposed_end_date, estimated_hours, estimated_hours_per_week, optimization_mode")
      .eq("id", proposalId)
      .eq("tenant_id", tenantId)
      .single();

    if (proposalError || !proposal) {
      return { error: "Proposal not found" };
    }

    let staffQuery = supabase
      .from("staff_profiles")
      .select("id, weekly_capacity_hours, users!inner(email, role, office_id, offices(name))")
      .eq("tenant_id", tenantId);

    if (officeIds.length > 0) {
      staffQuery = staffQuery.in("users.office_id", officeIds);
    }

    const { data: staffRows } = await staffQuery;
    const staff = (staffRows ?? []).map((row) => {
      const userRecord = row.users as
        | {
            email?: string;
            role?: string;
            office_id?: string | null;
            offices?: { name?: string } | { name?: string }[] | null;
          }
        | {
            email?: string;
            role?: string;
            office_id?: string | null;
            offices?: { name?: string } | { name?: string }[] | null;
          }[]
        | null;
      const user = Array.isArray(userRecord) ? userRecord[0] : userRecord;
      const officeRecord = Array.isArray(user?.offices) ? user?.offices[0] : user?.offices;
      return {
        id: row.id,
        weeklyCapacityHours: Number(row.weekly_capacity_hours),
        email: user?.email ?? "Unknown staff",
        role: user?.role ?? "staff",
        office: officeRecord?.name ?? "No office",
        officeId: user?.office_id ?? null,
      };
    });

    if (staff.length === 0) {
      return { error: "No staff found for the selected offices" };
    }

    const officeNames = Array.from(new Set(staff.map((member) => member.office).filter(Boolean))).sort();
    const staffIds = staff.map((member) => member.id);

    const { data: overlappingProjects } = await supabase
      .from("projects")
      .select("id, start_date, end_date")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .lte("start_date", proposal.proposed_end_date)
      .gte("end_date", proposal.proposed_start_date);

    const projectIds = (overlappingProjects ?? []).map((project) => project.id);
    const { data: assignmentRows } = projectIds.length > 0
      ? await supabase
          .from("project_assignments")
          .select("staff_id, allocation_percentage, project_id")
          .in("project_id", projectIds)
          .in("staff_id", staffIds)
      : { data: [] };

    const { data: leaveRows } = await supabase
      .from("leave_requests")
      .select("staff_id, start_date, end_date")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .in("staff_id", staffIds)
      .lte("start_date", proposal.proposed_end_date)
      .gte("end_date", proposal.proposed_start_date);

  return {
    proposal: {
      proposed_start_date: proposal.proposed_start_date,
      proposed_end_date: proposal.proposed_end_date,
      estimated_hours: proposal.estimated_hours,
      estimated_hours_per_week: proposal.estimated_hours_per_week,
      optimization_mode: proposal.optimization_mode,
    },
    staff,
    overlappingProjects: overlappingProjects ?? [],
    assignments: (assignmentRows ?? []).map((assignment) => ({
      staff_id: assignment.staff_id,
      allocation_percentage: Number(assignment.allocation_percentage),
      project_id: assignment.project_id,
    })),
    leaves: leaveRows ?? [],
    officeNames,
  };
}

type ComputedFeasibilityCore = Omit<FeasibilityResult, "optimizationMode" | "optimizationLabel" | "comparisons" | "officeNames">;

function computeFeasibilityCore(
  baseData: FeasibilityBaseData,
  optimizationMode: ProposalOptimizationMode,
  allowOverallocation: boolean,
  maxOverallocationPercent: number
): ComputedFeasibilityCore | FeasibilityError {
  if (!baseData.proposal.proposed_start_date || !baseData.proposal.proposed_end_date) {
    return { error: "Proposal must have a start and end date for feasibility analysis" };
  }

  const propStart = new Date(baseData.proposal.proposed_start_date + "T00:00:00Z");
  const propEnd = new Date(baseData.proposal.proposed_end_date + "T00:00:00Z");
  if (propEnd < propStart) return { error: "End date is before start date" };

  const estimatedHoursPerWeek =
    baseData.proposal.estimated_hours_per_week !== null && baseData.proposal.estimated_hours_per_week !== undefined
      ? Number(baseData.proposal.estimated_hours_per_week)
      : null;
  const estimatedTotalHours =
    baseData.proposal.estimated_hours !== null && baseData.proposal.estimated_hours !== undefined
      ? Number(baseData.proposal.estimated_hours)
      : null;
  const totalWorkingDays = workingDaysInRange(propStart, propEnd);

  if (estimatedHoursPerWeek === null && estimatedTotalHours === null) {
    return { error: "Proposal must have an hours estimate for feasibility analysis" };
  }
  if (estimatedHoursPerWeek === null && totalWorkingDays === 0) {
    return { error: "Proposal timeline has no working days" };
  }

  const safeOverallocationPct = Math.max(100, maxOverallocationPercent);
  const projectDates: Record<string, { start: Date; end: Date }> = {};
  for (const project of baseData.overlappingProjects) {
    if (project.start_date && project.end_date) {
      projectDates[project.id] = {
        start: new Date(project.start_date + "T00:00:00Z"),
        end: new Date(project.end_date + "T00:00:00Z"),
      };
    }
  }

  const weeks: WeekFeasibility[] = [];
  const staffUsedById = new Set<string>();
  let rawTotalAchievable = 0;
  let rawTotalOverallocatedHours = 0;
  const firstMonday = getMondayOf(propStart);
  const weekCursor = new Date(firstMonday);

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

    const requiredHours =
      estimatedHoursPerWeek !== null
        ? estimatedHoursPerWeek * weekFraction
        : ((estimatedTotalHours ?? 0) * workDays) / totalWorkingDays;

    const weekStaffCapacity: StaffCapacitySlice[] = [];
    const staffLabelsById = new Map<string, string>();
    let totalFreeCapacity = 0;

    for (const sp of baseData.staff) {
      const weeklyCapacity = sp.weeklyCapacityHours;
      const dailyCapacity = weeklyCapacity / 5;
      const effectiveCapacity = weeklyCapacity * weekFraction;

      // Sum up allocated hours from overlapping projects this week
      let allocatedHours = 0;
      for (const a of baseData.assignments) {
        if (a.staff_id !== sp.id) continue;
        const pd = projectDates[a.project_id];
        if (!pd) continue;
        // Check if this project overlaps this week
        if (pd.start > weekEnd || pd.end < weekStart) continue;
        allocatedHours += (a.allocation_percentage / 100) * weeklyCapacity * weekFraction;
      }

      // Subtract leave
      const leaveHrs = leaveHoursInWeek(baseData.leaves, sp.id, weekStart, weekEnd, dailyCapacity);
      const committedHours = allocatedHours + leaveHrs;
      const freeAt100 = Math.max(0, effectiveCapacity - committedHours);
      const maxAllowedHours = effectiveCapacity * (allowOverallocation ? safeOverallocationPct / 100 : 1);
      const freeAtCap = Math.max(0, maxAllowedHours - committedHours);

      const staffLabel = sp.email;
      staffLabelsById.set(sp.id, staffLabel);

      totalFreeCapacity += freeAtCap;
      weekStaffCapacity.push({
        id: sp.id,
        officeId: sp.officeId,
        freeAt100,
        freeAtCap,
        effectiveCapacity,
        committedHours,
      });
    }

    const freeCapacityAt100 = weekStaffCapacity.reduce((sum, member) => sum + member.freeAt100, 0);
    const cappedTotalCapacity = allowOverallocation ? totalFreeCapacity : freeCapacityAt100;
    const targetHours = Math.min(requiredHours, cappedTotalCapacity);
    const allocation = allocateForMode(
      optimizationMode,
      weekStaffCapacity,
      targetHours,
      allowOverallocation
    );
    const achievableHours = allocation.achievableHours;
    const overallocatedStaffNames = new Set<string>(
      allocation.overallocatedStaffIds.map((id) => staffLabelsById.get(id) ?? "Unknown staff")
    );
    for (const staffId of allocation.allocatedStaffIds) {
      staffUsedById.add(staffId);
    }
    const allocatedStaffCount = allocation.allocatedStaffCount;
    const overallocatedHours = allocation.overallocatedHours;
    rawTotalAchievable += achievableHours;
    rawTotalOverallocatedHours += overallocatedHours;

    // Count distinct active projects overlapping this week
    const activeProjectCount = baseData.overlappingProjects.filter((p) => {
      const pd = projectDates[p.id];
      return pd && pd.start <= weekEnd && pd.end >= weekStart;
    }).length;

    weeks.push({
      weekStart: toISODate(weekStart),
      weekEnd: toISODate(weekEnd),
      requiredHours: Math.round(requiredHours * 10) / 10,
      achievableHours: round1(achievableHours),
      totalFreeCapacity: round1(cappedTotalCapacity),
      allocatedStaffCount,
      overallocatedStaffCount: overallocatedStaffNames.size,
      overallocatedStaff: Array.from(overallocatedStaffNames).sort(),
      overallocatedHours: round1(overallocatedHours),
      activeProjectCount,
    });

    weekCursor.setUTCDate(weekCursor.getUTCDate() + 7);
  }

  const roundedWeeklyTotalRequired = weeks.reduce((s, w) => s + w.requiredHours, 0);
  const totalRequired =
    estimatedHoursPerWeek !== null ? roundedWeeklyTotalRequired : (estimatedTotalHours ?? roundedWeeklyTotalRequired);
  const totalAchievable = rawTotalAchievable;
  const feasibilityPercent =
    totalRequired > 0 ? Math.round((totalAchievable / totalRequired) * 1000) / 10 : 100;
  const staffUsedCount = staffUsedById.size;
  const totalOverallocatedHours = rawTotalOverallocatedHours;

  return {
    weeks,
    totalRequired: round1(totalRequired),
    totalAchievable: round1(totalAchievable),
    feasibilityPercent,
    staffUsedCount,
    totalOverallocatedHours: round1(totalOverallocatedHours),
    staffCount: baseData.staff.length,
    recommendedStaff: Array.from(staffUsedById)
      .map((staffId) => {
        const meta = baseData.staff.find((staff) => staff.id === staffId);
        return {
          id: staffId,
          name: meta?.email ?? "Unknown staff",
          role: meta?.role ?? "staff",
          office: meta?.office ?? "No office",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function computeFeasibility(
  proposalId: string,
  officeIds: string[] | null,
  allowOverallocation: boolean,
  maxOverallocationPercent = 120,
  optimizationModeInput?: ProposalOptimizationMode,
  includeComparisons = false
): Promise<FeasibilityResult | FeasibilityError> {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };

  const officeIdsKey = officeIds && officeIds.length > 0 ? [...officeIds].sort().join(",") : "";
  const baseDataOrError = await getFeasibilityBaseData(user.tenantId, proposalId, officeIdsKey);
  if ("error" in baseDataOrError) return baseDataOrError;

  const baseData = baseDataOrError;
  const optimizationMode = normalizeProposalOptimizationMode(
    optimizationModeInput ?? baseData.proposal.optimization_mode
  );

  const primaryCore = computeFeasibilityCore(
    baseData,
    optimizationMode,
    allowOverallocation,
    maxOverallocationPercent
  );
  if ("error" in primaryCore) {
    return { error: primaryCore.error ?? "Unable to compute feasibility" };
  }

  let comparisons: FeasibilityComparison[] | undefined;
  if (includeComparisons) {
    const comparisonModes = PROPOSAL_OPTIMIZATION_COMPARISON_MODES.filter((mode) => mode !== optimizationMode);
    comparisons = comparisonModes
      .map((mode) => {
        const scenario = computeFeasibilityCore(baseData, mode, allowOverallocation, maxOverallocationPercent);
        if ("error" in scenario) return null;
        return {
          mode,
          label: PROPOSAL_OPTIMIZATION_MODE_LABELS[mode],
          feasibilityPercent: scenario.feasibilityPercent,
          totalRequired: scenario.totalRequired,
          totalAchievable: scenario.totalAchievable,
          staffUsedCount: scenario.staffUsedCount,
          overallocatedStaffCount: scenario.weeks.reduce((sum, week) => sum + week.overallocatedStaffCount, 0),
          overallocatedHours: scenario.totalOverallocatedHours,
        } satisfies FeasibilityComparison;
      })
      .filter((item): item is FeasibilityComparison => item !== null);
  }

  return {
    optimizationMode,
    optimizationLabel: PROPOSAL_OPTIMIZATION_MODE_LABELS[optimizationMode],
    ...primaryCore,
    officeNames: baseData.officeNames,
    comparisons,
  };
}
