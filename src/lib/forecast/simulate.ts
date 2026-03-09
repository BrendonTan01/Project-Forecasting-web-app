import { createAdminClient } from "@/lib/supabase/admin";
import { filterEffectiveAssignmentsForWeek } from "@/lib/utils/assignmentEffective";
import { getProposalHoursForWeek } from "@/lib/utils/proposalHours";
import {
  addUtcDays,
  startOfCurrentWeekUtc,
  toDateString,
  toUtcDate,
  toWeekMonday,
  weekEndFromWeekStart,
} from "@/lib/utils/week";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;
const CAPACITY_RISK_THRESHOLD = 0.9;

export type SimulationResult = {
  proposal_id: string;
  current_utilization: number;
  simulated_utilization: number;
  capacity_risk: boolean;
  overload_week: number | null;
  current_capacity_risk: boolean;
  current_overload_week: number | null;
  expected_revenue: number | null;
  expected_cost: number | null;
  expected_margin: number | null;
  expected_margin_percent: number | null;
  financially_viable: boolean | null;
};

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

type ProposalRow = {
  id: string;
  estimated_hours_per_week: number | null;
  estimated_hours: number | null;
  proposed_start_date: string | null;
  proposed_end_date: string | null;
};

type RawProjectRelation = {
  start_date: string | null;
  end_date: string | null;
  status: string;
};

type RawAssignmentRow = {
  project_id: string;
  staff_id: string;
  weekly_hours_allocated: number | string | null;
  week_start: string | null;
  projects: RawProjectRelation | RawProjectRelation[] | null;
};

type AssignmentWithProject = {
  project_id: string;
  staff_id: string;
  weekly_hours_allocated: number;
  week_start: string | null;
  projects: RawProjectRelation | null;
};

type LeaveRow = {
  staff_id: string;
  start_date: string;
  end_date: string;
};

function normalizeProjectRelation(
  projects: RawProjectRelation | RawProjectRelation[] | null
): RawProjectRelation | null {
  if (Array.isArray(projects)) return projects[0] ?? null;
  return projects ?? null;
}

function workingDaysInRange(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setUTCHours(0, 0, 0, 0);
  while (cursor <= endCopy) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function leaveHoursInWeek(
  leaves: LeaveRow[],
  staffId: string,
  weekStart: Date,
  weekEnd: Date,
  dailyCapacity: number
): number {
  const weekEndFri = new Date(weekEnd);
  weekEndFri.setUTCDate(weekEnd.getUTCDate() - 2);

  let leaveDays = 0;
  for (const leave of leaves) {
    if (leave.staff_id !== staffId) continue;
    const leaveStart = new Date(`${leave.start_date}T00:00:00Z`);
    const leaveEnd = new Date(`${leave.end_date}T00:00:00Z`);
    const overlapStart = leaveStart > weekStart ? leaveStart : weekStart;
    const overlapEnd = leaveEnd < weekEndFri ? leaveEnd : weekEndFri;
    if (overlapStart <= overlapEnd) {
      leaveDays += workingDaysInRange(overlapStart, overlapEnd);
    }
  }
  return leaveDays * dailyCapacity;
}

/**
 * Simulates the capacity impact of adding a proposal to the current forecast.
 * Read-only — does not write to the database.
 */
export async function simulateProposalImpact(
  proposalId: string,
  tenantId: string,
  weeks: number = DEFAULT_WEEKS
): Promise<SimulationResult | null> {
  const clampedWeeks = Math.min(Math.max(1, weeks), MAX_WEEKS);
  const admin = createAdminClient();

  const { data: proposalData } = await admin
    .from("project_proposals")
    .select("id, estimated_hours_per_week, estimated_hours, proposed_start_date, proposed_end_date")
    .eq("id", proposalId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!proposalData) return null;
  const proposal = proposalData as ProposalRow;

  const fallbackStart = startOfCurrentWeekUtc();
  const fallbackEnd = addUtcDays(fallbackStart, clampedWeeks * 7 - 1);
  const startMondayStr = proposal.proposed_start_date
    ? toWeekMonday(proposal.proposed_start_date)
    : toDateString(fallbackStart);
  const endMondayStr = proposal.proposed_end_date
    ? toWeekMonday(proposal.proposed_end_date)
    : toWeekMonday(toDateString(fallbackEnd));
  const startMonday = toUtcDate(startMondayStr);
  const endMondayCandidate = toUtcDate(endMondayStr);
  const endMonday = endMondayCandidate < startMonday ? startMonday : endMondayCandidate;
  const totalWeeks =
    Math.max(1, Math.floor((endMonday.getTime() - startMonday.getTime()) / 86400000 / 7) + 1);
  const windowEnd = toUtcDate(weekEndFromWeekStart(toDateString(endMonday)));
  const windowEndStr = toDateString(windowEnd);

  const [{ data: staffProfiles }, { data: availabilityRows }, { data: assignments }, { data: leaveRows }] =
    await Promise.all([
      admin
        .from("staff_profiles")
        .select("id, weekly_capacity_hours, billable_rate, cost_rate")
        .eq("tenant_id", tenantId),
    admin
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", tenantId)
      .gte("week_start", startMondayStr)
      .lte("week_start", toDateString(endMonday)),

    admin
      .from("project_assignments")
      .select(
        "project_id, staff_id, weekly_hours_allocated, week_start, projects(start_date, end_date, status)"
      )
      .eq("tenant_id", tenantId),
    admin
      .from("leave_requests")
      .select("staff_id, start_date, end_date")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .lte("start_date", windowEndStr)
      .gte("end_date", startMondayStr),
  ]);
  const staff = (staffProfiles ?? []) as {
    id: string;
    weekly_capacity_hours: number;
    billable_rate: number | null;
    cost_rate: number | null;
  }[];

  const availMap = new Map<string, Map<string, number>>();
  for (const row of (availabilityRows ?? []) as {
    staff_id: string;
    week_start: string;
    available_hours: number;
  }[]) {
    if (!availMap.has(row.staff_id)) availMap.set(row.staff_id, new Map());
    availMap.get(row.staff_id)!.set(row.week_start, row.available_hours);
  }

  const rawAssignments = (assignments ?? []) as RawAssignmentRow[];
  const allAssignments: AssignmentWithProject[] = rawAssignments.map((row) => ({
    project_id: row.project_id,
    staff_id: row.staff_id,
    weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    week_start: row.week_start ?? null,
    projects: normalizeProjectRelation(row.projects),
  }));

  const activeAssignments = allAssignments.filter(
    (a) => a.projects?.status === "active"
  );

  let totalCurrentUtilization = 0;
  let totalSimulatedUtilization = 0;
  let currentOverloadWeek: number | null = null;
  let overloadWeek: number | null = null;
  let currentCapacityRisk = false;
  let capacityRisk = false;

  for (let i = 0; i < totalWeeks; i++) {
    const weekStart = addUtcDays(startMonday, i * 7);
    const weekStartStr = toDateString(weekStart);
    const weekEndStr = weekEndFromWeekStart(weekStartStr);
    const weekEnd = toUtcDate(weekEndStr);

    let totalCapacity = 0;
    for (const member of staff) {
      const override = availMap.get(member.id)?.get(weekStartStr);
      const weeklyCapacity = override !== undefined ? override : member.weekly_capacity_hours;
      const leaveHours = leaveHoursInWeek(
        (leaveRows ?? []) as LeaveRow[],
        member.id,
        weekStart,
        weekEnd,
        weeklyCapacity / 5
      );
      totalCapacity += Math.max(0, weeklyCapacity - leaveHours);
    }

    const totalProjectHours = filterEffectiveAssignmentsForWeek(activeAssignments, weekStartStr).reduce(
      (sum, assignment) => sum + assignment.weekly_hours_allocated,
      0
    );

    const proposalHours = getProposalHoursForWeek(proposal, weekStartStr, weekEndStr);
    const simulatedProjectHours = totalProjectHours + proposalHours;

    const currentRate = totalCapacity > 0 ? totalProjectHours / totalCapacity : 0;
    const simulatedRate =
      totalCapacity > 0 ? simulatedProjectHours / totalCapacity : 0;

    totalCurrentUtilization += currentRate;
    totalSimulatedUtilization += simulatedRate;

    if (currentRate > CAPACITY_RISK_THRESHOLD) {
      currentCapacityRisk = true;
      if (currentOverloadWeek === null) {
        currentOverloadWeek = i + 1;
      }
    }

    if (simulatedRate > CAPACITY_RISK_THRESHOLD) {
      capacityRisk = true;
      if (overloadWeek === null) {
        overloadWeek = i + 1;
      }
    }
  }

  const avgCurrentUtilization =
    Math.round((totalCurrentUtilization / totalWeeks) * 1000) / 1000;
  const avgSimulatedUtilization =
    Math.round((totalSimulatedUtilization / totalWeeks) * 1000) / 1000;

  const proposalEstimatedHours =
    proposal.estimated_hours !== null && proposal.estimated_hours !== undefined
      ? Number(proposal.estimated_hours)
      : null;
  const billableRates = staff
    .map((member) => member.billable_rate)
    .filter((rate): rate is number => rate !== null && rate !== undefined);
  const costRates = staff
    .map((member) => member.cost_rate)
    .filter((rate): rate is number => rate !== null && rate !== undefined);

  const averageBillableRate =
    billableRates.length > 0
      ? billableRates.reduce((sum, rate) => sum + Number(rate), 0) / billableRates.length
      : null;
  const averageCostRate =
    costRates.length > 0
      ? costRates.reduce((sum, rate) => sum + Number(rate), 0) / costRates.length
      : null;

  const expectedRevenue =
    proposalEstimatedHours !== null && averageBillableRate !== null
      ? roundCurrency(averageBillableRate * proposalEstimatedHours)
      : null;
  const expectedCost =
    proposalEstimatedHours !== null && averageCostRate !== null
      ? roundCurrency(averageCostRate * proposalEstimatedHours)
      : null;
  const expectedMargin =
    expectedRevenue !== null && expectedCost !== null
      ? roundCurrency(expectedRevenue - expectedCost)
      : null;
  const expectedMarginPercent =
    expectedRevenue !== null && expectedRevenue > 0 && expectedMargin !== null
      ? Math.round((expectedMargin / expectedRevenue) * 10000) / 100
      : null;
  const financiallyViable = expectedMargin !== null ? expectedMargin >= 0 : null;

  return {
    proposal_id: proposalId,
    current_utilization: avgCurrentUtilization,
    simulated_utilization: avgSimulatedUtilization,
    capacity_risk: capacityRisk,
    overload_week: overloadWeek,
    current_capacity_risk: currentCapacityRisk,
    current_overload_week: currentOverloadWeek,
    expected_revenue: expectedRevenue,
    expected_cost: expectedCost,
    expected_margin: expectedMargin,
    expected_margin_percent: expectedMarginPercent,
    financially_viable: financiallyViable,
  };
}
