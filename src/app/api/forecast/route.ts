import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import {
  getForecastForTenant,
  computeSkillShortages,
  computeHiringRecommendations,
} from "@/lib/forecast/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ForecastExplanationEntry } from "@/lib/types";
import { getProposalHoursForWeek } from "@/lib/utils/proposalHours";
import { toUtcDate, weekEndFromWeekStart } from "@/lib/utils/week";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;
const PROPOSAL_PIPELINE_STATUSES = ["draft", "submitted", "won"] as const;

type ProposalDemandRow = {
  id: string;
  name: string | null;
  estimated_hours_per_week: number | null;
  estimated_hours: number | null;
  proposed_start_date: string | null;
  proposed_end_date: string | null;
  win_probability: number | null;
};

type LeaveRequestRow = {
  staff_id: string;
  start_date: string;
  end_date: string;
};

type StaffNameRow = {
  id: string;
  name: string;
  weekly_capacity_hours: number;
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "financials:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const weeksParam = searchParams.get("weeks");
  const weeks = weeksParam
    ? Math.min(Math.max(1, parseInt(weeksParam, 10) || DEFAULT_WEEKS), MAX_WEEKS)
    : DEFAULT_WEEKS;

  try {
    const admin = createAdminClient();

    const [
      forecastRows,
      { data: proposalRows },
      skillShortages,
      hiringRecommendations,
      { data: leaveRows },
      { data: staffNameRows },
      { data: tenantSettings },
    ] = await Promise.all([
      getForecastForTenant(user.tenantId, weeks),
      admin
        .from("project_proposals")
        .select(
          "id, name, estimated_hours_per_week, estimated_hours, proposed_start_date, proposed_end_date, win_probability"
        )
        .eq("tenant_id", user.tenantId)
        .in("status", [...PROPOSAL_PIPELINE_STATUSES]),
      computeSkillShortages(user.tenantId, weeks),
      computeHiringRecommendations(user.tenantId, weeks),
      admin
        .from("leave_requests")
        .select("staff_id, start_date, end_date")
        .eq("tenant_id", user.tenantId)
        .eq("status", "approved"),
      admin
        .from("staff_profiles")
        .select("id, name, weekly_capacity_hours")
        .eq("tenant_id", user.tenantId),
      admin
        .from("tenants")
        .select("planning_hours_per_person_per_week")
        .eq("id", user.tenantId)
        .single(),
    ]);

    const proposals = (proposalRows ?? []) as ProposalDemandRow[];
    const leaveRequests = (leaveRows ?? []) as LeaveRequestRow[];
    const responseProposals = proposals.map((proposal) => ({
      id: proposal.id,
      name: proposal.name ?? "Unnamed Proposal",
      proposed_start_date: proposal.proposed_start_date,
      proposed_end_date: proposal.proposed_end_date,
      estimated_hours:
        proposal.estimated_hours === null ? null : Number(proposal.estimated_hours),
      estimated_hours_per_week:
        proposal.estimated_hours_per_week === null
          ? null
          : Number(proposal.estimated_hours_per_week),
      win_probability:
        proposal.win_probability === null
          ? null
          : Number(proposal.win_probability),
      has_complete_dates:
        Boolean(proposal.proposed_start_date) &&
        Boolean(proposal.proposed_end_date),
    }));

    const staffMap = new Map<string, StaffNameRow>();
    for (const s of (staffNameRows ?? []) as StaffNameRow[]) {
      staffMap.set(s.id, s);
    }

    const responseWeeks = forecastRows
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .map((row) => {
        const weekStart = row.week_start;
        const weekEnd = weekEndFromWeekStart(weekStart);

        let rawProposalDemand = 0;
        let expectedProposalDemand = 0;
        const proposalDemands: Array<{
          proposal_id: string;
          raw_hours: number;
          expected_hours: number;
        }> = [];
        const explanations: ForecastExplanationEntry[] = [];

        for (const proposal of proposals) {
          const rawHours = getProposalHoursForWeek(proposal, weekStart, weekEnd);
          const winProbability = Math.min(100, Math.max(0, Number(proposal.win_probability ?? 50)));
          const expectedHours = rawHours * (winProbability / 100);
          rawProposalDemand += rawHours;
          expectedProposalDemand += expectedHours;
          if (rawHours > 0 || expectedHours > 0) {
            proposalDemands.push({
              proposal_id: proposal.id,
              raw_hours: Math.round(rawHours * 100) / 100,
              expected_hours: Math.round(expectedHours * 100) / 100,
            });
          }
          if (rawHours > 0) {
            explanations.push({
              type: "proposal",
              proposal_id: proposal.id,
              name: proposal.name ?? "Unnamed Proposal",
              impact_hours: Math.round(rawHours * 100) / 100,
            });
          }
        }

        for (const leave of leaveRequests) {
          const overlapStart = leave.start_date > weekStart ? leave.start_date : weekStart;
          const overlapEnd = leave.end_date < weekEnd ? leave.end_date : weekEnd;
          if (overlapStart > overlapEnd) continue;
          const overlapDays =
            Math.floor(
              (toUtcDate(overlapEnd).getTime() -
                toUtcDate(overlapStart).getTime()) /
                86400000
            ) + 1;
          const staffMember = staffMap.get(leave.staff_id);
          if (!staffMember) continue;
          const impactHours =
            (Math.min(overlapDays, 5) / 5) * staffMember.weekly_capacity_hours;
          if (impactHours > 0) {
            explanations.push({
              type: "leave",
              name: staffMember.name,
              impact_hours: -Math.round(impactHours * 100) / 100,
            });
          }
        }

        return {
          week_start: row.week_start,
          total_capacity: row.total_capacity,
          total_project_hours: row.total_project_hours,
          utilization_rate: row.utilization_rate,
          staffing_gap: row.staffing_gap,
          raw_proposal_demand: Math.round(rawProposalDemand * 100) / 100,
          expected_proposal_demand: Math.round(expectedProposalDemand * 100) / 100,
          best_case_demand: Math.round(row.total_project_hours * 100) / 100,
          expected_demand: Math.round((row.total_project_hours + expectedProposalDemand) * 100) / 100,
          worst_case_demand: Math.round((row.total_project_hours + rawProposalDemand) * 100) / 100,
          proposal_demands: proposalDemands,
          forecast_explanation: explanations,
        };
      });

    return NextResponse.json({
      weeks: responseWeeks,
      skill_shortages: skillShortages,
      hiring_recommendations: hiringRecommendations,
      proposals: responseProposals,
      planning_hours_per_person_per_week: Number(
        tenantSettings?.planning_hours_per_person_per_week ?? 40
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forecast calculation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
