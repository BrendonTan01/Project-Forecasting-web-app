import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import {
  runForecastForTenant,
  computeSkillShortages,
  computeHiringRecommendations,
} from "@/lib/forecast/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ForecastExplanationEntry } from "@/lib/types";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;
const PROPOSAL_PIPELINE_STATUSES = ["draft", "submitted", "won"] as const;

type ProposalDemandRow = {
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

function toUtcDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00Z`);
}

function toWeekMonday(dateString: string): string {
  const date = toUtcDate(dateString);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getDateRangeOverlap(
  rangeStart: string,
  rangeEnd: string,
  weekStart: string,
  weekEnd: string
): boolean {
  return rangeStart <= weekEnd && rangeEnd >= weekStart;
}

function countProposalWeeks(proposalStart: string, proposalEnd: string): number {
  const startMonday = toUtcDate(toWeekMonday(proposalStart));
  const endMonday = toUtcDate(toWeekMonday(proposalEnd));
  if (endMonday < startMonday) {
    return 1;
  }

  const diffDays = Math.floor((endMonday.getTime() - startMonday.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

function getRawProposalHoursForWeek(
  proposal: ProposalDemandRow,
  weekStart: string,
  weekEnd: string
): number {
  const explicitWeeklyHours = proposal.estimated_hours_per_week;
  if (explicitWeeklyHours !== null && explicitWeeklyHours !== undefined) {
    return Math.max(0, Number(explicitWeeklyHours));
  }

  const totalEstimatedHours = proposal.estimated_hours;
  if (totalEstimatedHours === null || totalEstimatedHours === undefined || Number(totalEstimatedHours) <= 0) {
    return 0;
  }

  const dateAnchor = proposal.proposed_start_date ?? proposal.proposed_end_date;
  if (!dateAnchor) {
    return 0;
  }

  const rangeStart = proposal.proposed_start_date ?? dateAnchor;
  const rangeEnd = proposal.proposed_end_date ?? dateAnchor;

  if (!getDateRangeOverlap(rangeStart, rangeEnd, weekStart, weekEnd)) {
    return 0;
  }

  const proposalWeeks = countProposalWeeks(rangeStart, rangeEnd);
  return Number(totalEstimatedHours) / proposalWeeks;
}

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
    ] = await Promise.all([
      runForecastForTenant(user.tenantId, weeks),
      admin
        .from("project_proposals")
        .select(
          "name, estimated_hours_per_week, estimated_hours, proposed_start_date, proposed_end_date, win_probability"
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
    ]);

    const proposals = (proposalRows ?? []) as ProposalDemandRow[];
    const leaveRequests = (leaveRows ?? []) as LeaveRequestRow[];

    const staffMap = new Map<string, StaffNameRow>();
    for (const s of (staffNameRows ?? []) as StaffNameRow[]) {
      staffMap.set(s.id, s);
    }

    const responseWeeks = forecastRows
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .map((row) => {
        const weekStart = row.week_start;
        const weekDate = toUtcDate(weekStart);
        weekDate.setUTCDate(weekDate.getUTCDate() + 6);
        const weekEnd = weekDate.toISOString().slice(0, 10);

        let rawProposalDemand = 0;
        let expectedProposalDemand = 0;
        const explanations: ForecastExplanationEntry[] = [];

        for (const proposal of proposals) {
          const rawHours = getRawProposalHoursForWeek(proposal, weekStart, weekEnd);
          const winProbability = Math.min(100, Math.max(0, Number(proposal.win_probability ?? 50)));
          const expectedHours = rawHours * (winProbability / 100);
          rawProposalDemand += rawHours;
          expectedProposalDemand += expectedHours;
          if (rawHours > 0) {
            explanations.push({
              type: "proposal",
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
              (new Date(`${overlapEnd}T00:00:00Z`).getTime() -
                new Date(`${overlapStart}T00:00:00Z`).getTime()) /
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
          forecast_explanation: explanations,
        };
      });

    return NextResponse.json({
      weeks: responseWeeks,
      skill_shortages: skillShortages,
      hiring_recommendations: hiringRecommendations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forecast calculation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
