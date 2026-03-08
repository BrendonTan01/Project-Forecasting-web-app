import { createAdminClient } from "@/lib/supabase/admin";
import { filterEffectiveAssignmentsForWeek } from "@/lib/utils/assignmentEffective";
import { getProposalHoursForWeek } from "@/lib/utils/proposalHours";
import { addUtcDays, startOfCurrentWeekUtc, toDateString, weekEndFromWeekStart } from "@/lib/utils/week";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;
const CAPACITY_RISK_THRESHOLD = 0.9;

export type SimulationResult = {
  proposal_id: string;
  current_utilization: number;
  simulated_utilization: number;
  capacity_risk: boolean;
  overload_week: number | null;
  expected_revenue: number | null;
  expected_cost: number | null;
  expected_margin: number | null;
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

function normalizeProjectRelation(
  projects: RawProjectRelation | RawProjectRelation[] | null
): RawProjectRelation | null {
  if (Array.isArray(projects)) return projects[0] ?? null;
  return projects ?? null;
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

  const weekMonday = startOfCurrentWeekUtc();
  const forecastEnd = addUtcDays(weekMonday, clampedWeeks * 7 - 1);

  const [
    { data: proposalData },
    { data: staffProfiles },
    { data: availabilityRows },
    { data: assignments },
  ] = await Promise.all([
    admin
      .from("project_proposals")
      .select(
        "id, estimated_hours_per_week, estimated_hours, proposed_start_date, proposed_end_date"
      )
      .eq("id", proposalId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),

    admin
      .from("staff_profiles")
      .select("id, weekly_capacity_hours, billable_rate, cost_rate")
      .eq("tenant_id", tenantId),

    admin
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", tenantId)
      .gte("week_start", toDateString(weekMonday))
      .lte("week_start", toDateString(forecastEnd)),

    admin
      .from("project_assignments")
      .select(
        "project_id, staff_id, weekly_hours_allocated, week_start, projects(start_date, end_date, status)"
      )
      .eq("tenant_id", tenantId),
  ]);

  if (!proposalData) return null;

  const proposal = proposalData as ProposalRow;
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
  let overloadWeek: number | null = null;
  let capacityRisk = false;

  for (let i = 0; i < clampedWeeks; i++) {
    const weekStart = addUtcDays(weekMonday, i * 7);
    const weekStartStr = toDateString(weekStart);
    const weekEndStr = weekEndFromWeekStart(weekStartStr);

    let totalCapacity = 0;
    for (const member of staff) {
      const override = availMap.get(member.id)?.get(weekStartStr);
      totalCapacity += override !== undefined ? override : member.weekly_capacity_hours;
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

    if (simulatedRate > CAPACITY_RISK_THRESHOLD) {
      capacityRisk = true;
      if (overloadWeek === null) {
        overloadWeek = i + 1;
      }
    }
  }

  const avgCurrentUtilization =
    Math.round((totalCurrentUtilization / clampedWeeks) * 1000) / 1000;
  const avgSimulatedUtilization =
    Math.round((totalSimulatedUtilization / clampedWeeks) * 1000) / 1000;

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

  return {
    proposal_id: proposalId,
    current_utilization: avgCurrentUtilization,
    simulated_utilization: avgSimulatedUtilization,
    capacity_risk: capacityRisk,
    overload_week: overloadWeek,
    expected_revenue: expectedRevenue,
    expected_cost: expectedCost,
    expected_margin: expectedMargin,
  };
}
