import type { ReactNode } from "react";
import type {
  ForecastProposal,
  ForecastWeek,
  HiringRecommendation,
} from "./types";

interface Props {
  weeks: ForecastWeek[];
  hiringRecommendations: HiringRecommendation[];
  proposals: ForecastProposal[];
  selectedProposalIds: string[];
  onSelectedProposalIdsChange: (ids: string[]) => void;
  planningHoursPerPersonPerWeek: number;
  showProposalSelection?: boolean;
  showStaffingRisks?: boolean;
  showHiringRecommendations?: boolean;
  showForecastDrivers?: boolean;
  showExecutiveInsight?: boolean;
  className?: string;
}

type StaffingRisk = {
  week_start: string;
  staffing_gap: number;
};

type AggregatedDriver = {
  type: "proposal" | "leave" | "project";
  displayName: string;
  impact_hours: number;
};

function formatWeekLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
}

function formatHoursWithPeople(value: number, planningHoursPerPersonPerWeek: number): string {
  const people = value / planningHoursPerPersonPerWeek;
  return `${formatHours(value)} (${people.toFixed(2)} people)`;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold leading-none text-zinc-500"
      title={text}
      aria-label={text}
    >
      i
    </span>
  );
}

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

function formatShortDate(isoDate: string | null): string {
  if (!isoDate) return "No start date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function countProposalWeeks(proposal: ForecastProposal): number | null {
  if (!proposal.proposed_start_date || !proposal.proposed_end_date) return null;
  const startMonday = toUtcDate(toWeekMonday(proposal.proposed_start_date));
  const endMonday = toUtcDate(toWeekMonday(proposal.proposed_end_date));
  if (endMonday < startMonday) return 1;
  const diffDays = Math.floor((endMonday.getTime() - startMonday.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

function getProposalHoursPerWeekLabel(proposal: ForecastProposal): string {
  if (
    proposal.estimated_hours_per_week !== null &&
    proposal.estimated_hours_per_week !== undefined
  ) {
    return `${formatHours(Number(proposal.estimated_hours_per_week))}/week`;
  }
  if (proposal.estimated_hours === null || proposal.estimated_hours === undefined) {
    return "No hrs/week";
  }
  const weekCount = countProposalWeeks(proposal);
  if (!weekCount || weekCount <= 0) {
    return "No hrs/week";
  }
  return `${formatHours(Number(proposal.estimated_hours) / weekCount)}/week`;
}

function formatProbability(probability: number | null): string {
  if (probability === null || probability === undefined) return "P: --";
  return `P: ${Math.round(Math.max(0, Math.min(100, probability)))}%`;
}

function ProposalSelectionSection({
  proposals,
  selectedProposalIds,
  onSelectedProposalIdsChange,
}: {
  proposals: ForecastProposal[];
  selectedProposalIds: string[];
  onSelectedProposalIdsChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Scenario Modeling
        </h3>
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {selectedProposalIds.length} selected
        </span>
      </div>
      {proposals.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No proposals available.</p>
      ) : (
        <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 340 }}>
          {proposals.map((proposal) => {
            const checked = selectedProposalIds.includes(proposal.id);
            return (
              <label
                key={proposal.id}
                className={`block rounded-lg border px-3 py-2.5 text-[11px] transition ${
                  checked
                    ? "border-zinc-300 bg-zinc-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                    checked={checked}
                    onChange={(event) => {
                      const nextChecked = event.target.checked;
                      if (nextChecked) {
                        if (checked) return;
                        onSelectedProposalIdsChange([...selectedProposalIds, proposal.id]);
                        return;
                      }
                      onSelectedProposalIdsChange(
                        selectedProposalIds.filter((id) => id !== proposal.id)
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center justify-between gap-2">
                      <span className="block truncate font-semibold text-zinc-800">
                        {proposal.name}
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-zinc-500">
                        {formatProbability(proposal.win_probability)}
                      </span>
                    </span>
                    <span className="text-zinc-500">
                      {getProposalHoursPerWeekLabel(proposal)} {" \u00b7 "} Start{" "}
                      {formatShortDate(proposal.proposed_start_date)}
                      {!proposal.has_complete_dates ? " \u00b7 missing dates" : ""}
                    </span>
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StaffingRisksSection({
  weeks,
  planningHoursPerPersonPerWeek,
}: {
  weeks: ForecastWeek[];
  planningHoursPerPersonPerWeek: number;
}) {
  const risks: StaffingRisk[] = weeks
    .filter((w) => w.staffing_gap > 0)
    .sort((a, b) => b.staffing_gap - a.staffing_gap)
    .slice(0, 5)
    .map((w) => ({ week_start: w.week_start, staffing_gap: w.staffing_gap }));

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <span>Top Staffing Risks</span>
        <InfoTooltip text="Overall weekly capacity risk. This ranks weeks by total staffing gap across all skills combined." />
      </h3>
      <p className="mb-2 text-[11px] text-zinc-500">
        Weeks with the largest total staffing gap across all skills.
      </p>
      {risks.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No staffing gaps in the forecast window.</p>
      ) : (
        <ul className="space-y-1.5">
          {risks.map((risk) => {
            const isCritical = risk.staffing_gap > 40;
            return (
              <li
                key={risk.week_start}
                className="flex items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-1.5"
              >
                <span className="text-xs text-zinc-700">w/c {formatWeekLabel(risk.week_start)}</span>
                <span
                  className={`app-badge ${isCritical ? "app-badge-danger" : "app-badge-warning"} shrink-0`}
                >
                  {formatHoursWithPeople(risk.staffing_gap, planningHoursPerPersonPerWeek)} gap
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function HiringRecommendationsSection({
  recommendations,
}: {
  recommendations: HiringRecommendation[];
}) {
  const top = [...recommendations]
    .sort((a, b) => b.staff_needed - a.staff_needed)
    .slice(0, 5);

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <span>Top Hiring Recommendations (by Skill)</span>
        <InfoTooltip text="Skill-specific signal. Recommendations can appear even when no overall staffing gap exists, if demand is concentrated in specific skills." />
      </h3>
      <p className="mb-2 text-[11px] text-zinc-500">
        Suggested hires grouped by skill shortage in the forecast window.
      </p>
      {top.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No hiring recommendations at this time.</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((rec) => (
            <li
              key={rec.skill}
              className="flex items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-1.5"
            >
              <span className="truncate text-xs font-medium text-zinc-800">{rec.skill}</span>
              <span className="app-badge app-badge-warning shrink-0">
                +{rec.staff_needed} hire{rec.staff_needed !== 1 ? "s" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function aggregateDriversForSelectedProposals(
  weeks: ForecastWeek[],
  selectedProposalIdSet?: Set<string>
): AggregatedDriver[] {
  const map = new Map<string, AggregatedDriver>();
  for (const week of weeks) {
    for (const entry of week.forecast_explanation ?? []) {
      if (
        entry.type === "proposal" &&
        selectedProposalIdSet &&
        entry.proposal_id &&
        !selectedProposalIdSet.has(entry.proposal_id)
      ) {
        continue;
      }
      const displayName = entry.name;
      const key = `${entry.type}::${displayName}`;
      const existing = map.get(key);
      if (existing) {
        existing.impact_hours =
          Math.round((existing.impact_hours + entry.impact_hours) * 100) / 100;
      } else {
        map.set(key, {
          type: entry.type,
          displayName,
          impact_hours: Math.round(entry.impact_hours * 100) / 100,
        });
      }
    }
  }
  return Array.from(map.values())
    .sort((a, b) => Math.abs(b.impact_hours) - Math.abs(a.impact_hours))
    .slice(0, 5);
}

const DRIVER_COLORS: Record<"proposal" | "leave" | "project", string> = {
  proposal: "#1d4ed8",
  leave: "#dc2626",
  project: "#10b981",
};

function ForecastDriversSection({
  weeks,
  selectedProposalIds,
}: {
  weeks: ForecastWeek[];
  selectedProposalIds?: string[];
}) {
  const selectedProposalIdSet = selectedProposalIds
    ? new Set(selectedProposalIds)
    : undefined;
  const drivers = aggregateDriversForSelectedProposals(weeks, selectedProposalIdSet);

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Top Forecast Drivers
      </h3>
      <p className="mb-2 text-[11px] text-zinc-500">
        Based on committed work, leave, and currently selected proposals.
      </p>
      {drivers.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No explanation data available.</p>
      ) : (
        <ul className="space-y-1.5">
          {drivers.map((driver, idx) => {
            const color = DRIVER_COLORS[driver.type];
            const sign = driver.impact_hours >= 0 ? "+" : "−";
            const absHours = Math.abs(driver.impact_hours);
            return (
              <li key={idx} className="flex items-center gap-2 rounded border border-zinc-100 px-3 py-1.5">
                <span
                  className="shrink-0 text-[10px] font-semibold uppercase"
                  style={{ color }}
                >
                  {driver.type.slice(0, 4)}
                </span>
                <span className="flex-1 truncate text-xs text-zinc-700">{driver.displayName}</span>
                <span
                  className="shrink-0 text-xs font-semibold tabular-nums"
                  style={{ color }}
                >
                  {sign}{absHours}h
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExecutiveInsightSection({
  weeks,
  proposals,
  selectedProposalIds,
}: {
  weeks: ForecastWeek[];
  proposals: ForecastProposal[];
  selectedProposalIds: string[];
}) {
  const SAFE_UTILIZATION_THRESHOLD = 90;
  const selectedProposalIdSet = new Set(selectedProposalIds);
  const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const expectedUtilizationByWeek = weeks.map((week) => {
    const selectedProposalDemands = (week.proposal_demands ?? []).filter((demand) =>
      selectedProposalIdSet.has(demand.proposal_id)
    );
    const expectedSelectedProposalHours = selectedProposalDemands.reduce(
      (sum, demand) => sum + Number(demand.expected_hours ?? 0),
      0
    );

    const expectedDemand = Number(week.total_project_hours) + expectedSelectedProposalHours;
    const utilization =
      week.total_capacity > 0 ? (expectedDemand / Number(week.total_capacity)) * 100 : 0;
    const overshootHours =
      week.total_capacity > 0 && utilization > SAFE_UTILIZATION_THRESHOLD
        ? ((utilization - SAFE_UTILIZATION_THRESHOLD) / 100) * Number(week.total_capacity)
        : 0;

    return {
      week_start: week.week_start,
      total_capacity: Number(week.total_capacity),
      expected_utilization: utilization,
      overshoot_hours: overshootHours,
      selected_proposal_demands: selectedProposalDemands,
    };
  });

  const peakWeek = expectedUtilizationByWeek.reduce(
    (peak, current) =>
      current.expected_utilization > peak.expected_utilization ? current : peak,
    expectedUtilizationByWeek[0] ?? {
      week_start: "",
      total_capacity: 0,
      expected_utilization: 0,
      overshoot_hours: 0,
      selected_proposal_demands: [] as Array<{
        proposal_id: string;
        raw_hours: number;
        expected_hours: number;
      }>,
    }
  );

  const overloadedWeeks = expectedUtilizationByWeek.filter(
    (week) => week.expected_utilization > SAFE_UTILIZATION_THRESHOLD
  );

  const proposalImpact = new Map<
    string,
    { overload_hours: number; peak_week_hours: number; active_weeks: number; total_hours: number }
  >();
  for (const week of expectedUtilizationByWeek) {
    for (const demand of week.selected_proposal_demands) {
      const expectedHours = Number(demand.expected_hours ?? 0);
      if (expectedHours <= 0) continue;
      const existing = proposalImpact.get(demand.proposal_id) ?? {
        overload_hours: 0,
        peak_week_hours: 0,
        active_weeks: 0,
        total_hours: 0,
      };
      existing.total_hours += expectedHours;
      existing.active_weeks += 1;
      if (week.week_start === peakWeek.week_start) {
        existing.peak_week_hours += expectedHours;
      }
      if (week.expected_utilization > SAFE_UTILIZATION_THRESHOLD) {
        existing.overload_hours += expectedHours;
      }
      proposalImpact.set(demand.proposal_id, existing);
    }
  }

  const topMitigation = Array.from(proposalImpact.entries())
    .sort((a, b) => {
      if (b[1].overload_hours !== a[1].overload_hours) {
        return b[1].overload_hours - a[1].overload_hours;
      }
      return b[1].peak_week_hours - a[1].peak_week_hours;
    })[0];

  const topProposalId = topMitigation?.[0] ?? null;
  const topProposalStats = topMitigation?.[1] ?? null;
  const topProposalName = topProposalId
    ? proposalsById.get(topProposalId)?.name ?? "Selected proposal"
    : null;
  const topProposalPeakHours = Number(topProposalStats?.peak_week_hours ?? 0);
  const avgTopProposalWeeklyHours =
    topProposalStats && topProposalStats.active_weeks > 0
      ? topProposalStats.total_hours / topProposalStats.active_weeks
      : 0;

  const overshoot = peakWeek.expected_utilization - SAFE_UTILIZATION_THRESHOLD;
  const recommendedDelayWeeks =
    peakWeek.overshoot_hours > 0 && avgTopProposalWeeklyHours > 0
      ? Math.min(6, Math.max(1, Math.ceil(peakWeek.overshoot_hours / avgTopProposalWeeklyHours)))
      : 2;
  const peakReductionPct =
    peakWeek.total_capacity > 0 ? (topProposalPeakHours / peakWeek.total_capacity) * 100 : 0;
  const postMitigationPeak = Math.max(0, peakWeek.expected_utilization - peakReductionPct);

  function summarizePeakAfterRemoving(removedProposalIds: Set<string>) {
    const adjustedWeeks = expectedUtilizationByWeek.map((week) => {
      const removedHours = week.selected_proposal_demands
        .filter((demand) => removedProposalIds.has(demand.proposal_id))
        .reduce((sum, demand) => sum + Number(demand.expected_hours ?? 0), 0);
      const adjustedDemand =
        Number(week.total_capacity) * (week.expected_utilization / 100) - removedHours;
      const adjustedUtilization =
        week.total_capacity > 0 ? (adjustedDemand / Number(week.total_capacity)) * 100 : 0;
      return {
        week_start: week.week_start,
        expected_utilization: adjustedUtilization,
      };
    });
    return adjustedWeeks.reduce(
      (peak, current) =>
        current.expected_utilization > peak.expected_utilization ? current : peak,
      adjustedWeeks[0] ?? { week_start: "", expected_utilization: 0 }
    );
  }

  const candidateProposalIds = Array.from(proposalImpact.keys());
  const moveOne = candidateProposalIds
    .map((proposalId) => {
      const peakAfterMove = summarizePeakAfterRemoving(new Set([proposalId]));
      const baselinePeak = peakWeek.expected_utilization;
      return {
        proposalId,
        peakAfterMove,
        peakReduction: baselinePeak - peakAfterMove.expected_utilization,
      };
    })
    .sort((a, b) => b.peakReduction - a.peakReduction)[0];

  const moveTwo = moveOne
    ? candidateProposalIds
        .filter((proposalId) => proposalId !== moveOne.proposalId)
        .map((proposalId) => {
          const peakAfterMove = summarizePeakAfterRemoving(
            new Set([moveOne.proposalId, proposalId])
          );
          return {
            proposalId,
            peakAfterMove,
            peakReductionFromMoveOne:
              moveOne.peakAfterMove.expected_utilization - peakAfterMove.expected_utilization,
          };
        })
        .sort((a, b) => b.peakReductionFromMoveOne - a.peakReductionFromMoveOne)[0]
    : null;

  function getDelayWeeks(proposalId: string, targetOvershootHours: number): number {
    const stats = proposalImpact.get(proposalId);
    const avgWeeklyHours =
      stats && stats.active_weeks > 0 ? stats.total_hours / stats.active_weeks : 0;
    if (targetOvershootHours <= 0 || avgWeeklyHours <= 0) return 1;
    return Math.min(6, Math.max(1, Math.ceil(targetOvershootHours / avgWeeklyHours)));
  }

  const message =
    peakWeek.week_start === ""
      ? "Insufficient forecast data to generate an insight."
      : overshoot <= 0
        ? `Expected utilization peaks at ${peakWeek.expected_utilization.toFixed(1)}% in w/c ${formatWeekLabel(peakWeek.week_start)}. Current selected scenarios remain inside the ${SAFE_UTILIZATION_THRESHOLD}% safety threshold.`
        : moveOne && moveOne.peakReduction > 0
          ? (() => {
              const moveOneName =
                proposalsById.get(moveOne.proposalId)?.name ?? "Selected proposal";
              const moveOneDelayWeeks = getDelayWeeks(moveOne.proposalId, peakWeek.overshoot_hours);
              const moveOnePeak = moveOne.peakAfterMove.expected_utilization;

              if (moveTwo && moveTwo.peakReductionFromMoveOne > 0) {
                const moveTwoName =
                  proposalsById.get(moveTwo.proposalId)?.name ?? "Another proposal";
                const remainingOvershootHoursAfterMoveOne =
                  moveOnePeak > SAFE_UTILIZATION_THRESHOLD
                    ? ((moveOnePeak - SAFE_UTILIZATION_THRESHOLD) / 100) * peakWeek.total_capacity
                    : 0;
                const moveTwoDelayWeeks = getDelayWeeks(
                  moveTwo.proposalId,
                  remainingOvershootHoursAfterMoveOne
                );
                const moveTwoPeak = moveTwo.peakAfterMove.expected_utilization;
                return `Peak expected utilization hits ${peakWeek.expected_utilization.toFixed(1)}% in w/c ${formatWeekLabel(peakWeek.week_start)}. Best 2-step mitigation: (1) delay ${moveOneName} by ${moveOneDelayWeeks} week${moveOneDelayWeeks !== 1 ? "s" : ""} to reduce peak to ~${moveOnePeak.toFixed(1)}%; (2) delay ${moveTwoName} by ${moveTwoDelayWeeks} week${moveTwoDelayWeeks !== 1 ? "s" : ""} to reduce peak further to ~${moveTwoPeak.toFixed(1)}%. ${moveTwoPeak > SAFE_UTILIZATION_THRESHOLD ? "A third adjustment may still be needed to stay below threshold." : "This sequence should bring utilization back inside the safety threshold."}`;
              }

              return `Peak expected utilization hits ${peakWeek.expected_utilization.toFixed(1)}% in w/c ${formatWeekLabel(peakWeek.week_start)}. Best first move: delay ${moveOneName} by ${moveOneDelayWeeks} week${moveOneDelayWeeks !== 1 ? "s" : ""}; this could reduce that peak to about ${moveOnePeak.toFixed(1)}% (−${moveOne.peakReduction.toFixed(1)} pts). ${moveOnePeak > SAFE_UTILIZATION_THRESHOLD ? "A secondary reallocation may still be needed to get below threshold." : "This should bring the week back within the safety threshold."}`;
            })()
        : topProposalName && topProposalPeakHours > 0
          ? `Peak expected utilization hits ${peakWeek.expected_utilization.toFixed(1)}% in w/c ${formatWeekLabel(peakWeek.week_start)}. Best first move: delay ${topProposalName} by ${recommendedDelayWeeks} week${recommendedDelayWeeks !== 1 ? "s" : ""}; this could reduce that peak to about ${postMitigationPeak.toFixed(1)}% (−${peakReductionPct.toFixed(1)} pts). ${postMitigationPeak > SAFE_UTILIZATION_THRESHOLD ? "A secondary reallocation may still be needed to get below threshold." : "This should bring the week back within the safety threshold."}`
          : overloadedWeeks.length > 0
            ? `Expected utilization reaches ${peakWeek.expected_utilization.toFixed(1)}% in w/c ${formatWeekLabel(peakWeek.week_start)}, above the ${SAFE_UTILIZATION_THRESHOLD}% threshold. Consider rebalancing assignments in ${overloadedWeeks.length} overloaded week${overloadedWeeks.length !== 1 ? "s" : ""}.`
            : `Expected utilization reaches ${peakWeek.expected_utilization.toFixed(1)}% in w/c ${formatWeekLabel(peakWeek.week_start)}, above the ${SAFE_UTILIZATION_THRESHOLD}% threshold. Consider rebalancing assignments before this period.`;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Intelligence Insight
      </h3>
      <div className="rounded-xl bg-slate-900 px-4 py-3.5 text-sm leading-relaxed text-slate-100">
        {message}
      </div>
    </div>
  );
}

export function DashboardActionPanel({
  weeks,
  hiringRecommendations,
  proposals,
  selectedProposalIds,
  onSelectedProposalIdsChange,
  planningHoursPerPersonPerWeek,
  showProposalSelection = true,
  showStaffingRisks = true,
  showHiringRecommendations = true,
  showForecastDrivers = true,
  showExecutiveInsight = false,
  className,
}: Props) {
  const sections: Array<{ key: string; node: ReactNode }> = [];

  if (showProposalSelection) {
    sections.push({
      key: "proposal-selection",
      node: (
        <ProposalSelectionSection
          proposals={proposals}
          selectedProposalIds={selectedProposalIds}
          onSelectedProposalIdsChange={onSelectedProposalIdsChange}
        />
      ),
    });
  }

  if (showExecutiveInsight) {
    sections.push({
      key: "executive-insight",
      node: (
        <ExecutiveInsightSection
          weeks={weeks}
          proposals={proposals}
          selectedProposalIds={selectedProposalIds}
        />
      ),
    });
  }

  if (showStaffingRisks) {
    sections.push({
      key: "staffing-risks",
      node: (
        <StaffingRisksSection
          weeks={weeks}
          planningHoursPerPersonPerWeek={planningHoursPerPersonPerWeek}
        />
      ),
    });
  }

  if (showHiringRecommendations) {
    sections.push({
      key: "hiring-recommendations",
      node: <HiringRecommendationsSection recommendations={hiringRecommendations} />,
    });
  }

  if (showForecastDrivers) {
    sections.push({
      key: "forecast-drivers",
      node: (
        <ForecastDriversSection
          weeks={weeks}
          selectedProposalIds={selectedProposalIds}
        />
      ),
    });
  }

  return (
    <div className={`app-card flex h-full flex-col divide-y divide-zinc-100 p-4 ${className ?? ""}`}>
      {sections.map((section, index) => (
        <div
          key={section.key}
          className={index === 0 ? "pb-4" : index === sections.length - 1 ? "pt-4" : "py-4"}
        >
          {section.node}
        </div>
      ))}
    </div>
  );
}
