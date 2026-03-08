import { rangesOverlap, toUtcDate, toWeekMonday } from "@/lib/utils/week";

export type ProposalWeekHoursInput = {
  estimated_hours_per_week: number | null;
  estimated_hours: number | null;
  proposed_start_date: string | null;
  proposed_end_date: string | null;
};

function countProposalWeeks(proposalStart: string, proposalEnd: string): number {
  const startMonday = toUtcDate(toWeekMonday(proposalStart));
  const endMonday = toUtcDate(toWeekMonday(proposalEnd));
  if (endMonday < startMonday) {
    return 1;
  }

  const diffDays = Math.floor((endMonday.getTime() - startMonday.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Shared proposal demand policy:
 * - use explicit weekly hours when provided
 * - otherwise spread total hours over Monday-aligned proposal weeks
 */
export function getProposalHoursForWeek(
  proposal: ProposalWeekHoursInput,
  weekStart: string,
  weekEnd: string
): number {
  const explicitWeeklyHours = proposal.estimated_hours_per_week;
  if (explicitWeeklyHours !== null && explicitWeeklyHours !== undefined) {
    const rangeStart = proposal.proposed_start_date;
    const rangeEnd = proposal.proposed_end_date;
    if (rangeStart && rangeEnd && !rangesOverlap(rangeStart, rangeEnd, weekStart, weekEnd)) {
      return 0;
    }

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
  if (!rangesOverlap(rangeStart, rangeEnd, weekStart, weekEnd)) {
    return 0;
  }

  return Number(totalEstimatedHours) / countProposalWeeks(rangeStart, rangeEnd);
}

