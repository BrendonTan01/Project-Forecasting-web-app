"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FeasibilityResult, WeekFeasibility } from "./feasibility-actions";
import type { SimulationResult } from "./ProposalImpactPanel";

type Props = {
  result: FeasibilityResult | { error: string } | null;
  isPending?: boolean;
  simulationActive?: boolean;
  simulationData?: SimulationResult | null;
};

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function feasibilityColor(ratio: number): string {
  if (ratio >= 0.9) return "bg-emerald-500";
  if (ratio >= 0.5) return "bg-amber-400";
  return "bg-red-400";
}

function feasibilityTextColor(ratio: number): string {
  if (ratio >= 0.9) return "text-emerald-700";
  if (ratio >= 0.5) return "text-amber-700";
  return "text-red-600";
}

function feasibilityBgColor(ratio: number): string {
  if (ratio >= 0.9) return "bg-emerald-50";
  if (ratio >= 0.5) return "bg-amber-50";
  return "bg-red-50";
}

function hasSimulationUtilizationData(
  data: SimulationResult | null | undefined
): data is SimulationResult & { current_utilization: number; simulated_utilization: number } {
  return (
    data !== null &&
    data !== undefined &&
    data.current_utilization !== undefined &&
    data.simulated_utilization !== undefined
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildEqualSplit(ids: string[]): Record<string, number> {
  if (ids.length === 0) return {};
  const base = round1(100 / ids.length);
  const split: Record<string, number> = {};
  for (const id of ids) split[id] = base;
  const total = Object.values(split).reduce((sum, value) => sum + value, 0);
  const remainder = round1(100 - total);
  split[ids[ids.length - 1]] = round1(split[ids[ids.length - 1]] + remainder);
  return split;
}

function OverallBadge({ percent }: { percent: number }) {
  const ratio = percent / 100;
  const bg = feasibilityBgColor(ratio);
  const text = feasibilityTextColor(ratio);
  const label =
    percent >= 90 ? "Fully feasible" : percent >= 50 ? "Partially feasible" : "Insufficient capacity";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${bg} ${text}`}>
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          percent >= 90 ? "bg-emerald-500" : percent >= 50 ? "bg-amber-400" : "bg-red-400"
        }`}
      />
      {label}
    </span>
  );
}

function WeekBar({ week, maxHours }: { week: WeekFeasibility; maxHours: number }) {
  const [hovered, setHovered] = useState(false);
  const ratio = week.requiredHours > 0 ? week.achievableHours / week.requiredHours : 1;
  const barHeightPct = maxHours > 0 ? (week.requiredHours / maxHours) * 100 : 100;
  const fillPct = Math.min(ratio * 100, 100);
  const color = feasibilityColor(ratio);

  return (
    <div
      className="group focus-ring relative flex h-full flex-1 flex-col items-center justify-end gap-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
      aria-label={`Week ${formatDate(week.weekStart)} to ${formatDate(week.weekEnd)} capacity details`}
    >
      <div
        className="relative w-full min-w-[18px] rounded-t-sm bg-zinc-100"
        style={{ height: `${Math.max(barHeightPct, 14)}%`, minHeight: "10px" }}
      >
        <div
          className={`absolute bottom-0 left-0 right-0 rounded-t-sm transition-all ${color}`}
          style={{ height: `${fillPct}%` }}
        />
        {week.overallocatedStaffCount > 0 && (
          <div
            className="absolute -top-1 right-0 h-2 w-2 rounded-full bg-amber-400 ring-1 ring-white"
            title="Some staff would be above 100% allocation"
          />
        )}
      </div>

      {hovered && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-lg">
          <p className="mb-1 font-semibold text-zinc-900">
            {formatDate(week.weekStart)} – {formatDate(week.weekEnd)}
          </p>
          <div className="space-y-1 text-zinc-600">
            <div className="flex justify-between">
              <span>Required</span>
              <span className="font-medium text-zinc-900">{week.requiredHours}h</span>
            </div>
            <div className="flex justify-between">
              <span>Achievable</span>
              <span className={`font-medium ${feasibilityTextColor(ratio)}`}>{week.achievableHours}h</span>
            </div>
            <div className="flex justify-between">
              <span>Free capacity</span>
              <span className="font-medium text-zinc-900">{week.totalFreeCapacity}h</span>
            </div>
            {week.activeProjectCount > 0 && (
              <div className="flex justify-between">
                <span>Active projects</span>
                <span className="font-medium text-zinc-900">{week.activeProjectCount}</span>
              </div>
            )}
            {week.overallocatedStaffCount > 0 && (
              <p className="mt-1 rounded bg-amber-50 px-1.5 py-1 text-amber-700">
                {week.overallocatedStaffCount} staff would be above 100%
              </p>
            )}
            {week.overallocatedStaff.length > 0 && (
              <div className="mt-1">
                <p className="mb-0.5 text-zinc-500">Impacted staff</p>
                <p className="line-clamp-3 text-zinc-700">{week.overallocatedStaff.join(", ")}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function generateInsight(result: FeasibilityResult): string {
  const { weeks, feasibilityPercent, totalRequired, totalAchievable } = result;
  const shortfall = Math.round(totalRequired - totalAchievable);
  const lowWeeks = weeks.filter((w) => w.requiredHours > 0 && w.achievableHours / w.requiredHours < 0.5);
  const fullWeeks = weeks.filter((w) => w.requiredHours > 0 && w.achievableHours / w.requiredHours >= 0.9);

  if (feasibilityPercent >= 90) {
    return `Staff have sufficient capacity to absorb this project. ${fullWeeks.length} of ${weeks.length} weeks are fully covered.`;
  }

  const parts: string[] = [];
  parts.push(`${feasibilityPercent.toFixed(1)}% of required hours (${totalAchievable}h of ${totalRequired}h) are achievable with current staffing.`);

  if (shortfall > 0) {
    parts.push(`Shortfall of ${shortfall}h across the project period.`);
  }

  if (lowWeeks.length > 0) {
    parts.push(`${lowWeeks.length} week${lowWeeks.length > 1 ? "s" : ""} have less than 50% capacity available — primarily driven by existing project commitments.`);
  }

  if (fullWeeks.length > 0) {
    parts.push(`${fullWeeks.length} week${fullWeeks.length > 1 ? "s are" : " is"} fully feasible as other projects reduce in overlap.`);
  }

  return parts.join(" ");
}

export function FeasibilityAnalysis({
  result,
  isPending = false,
  simulationActive = false,
  simulationData = null,
}: Props) {
  const hasResult = result && !("error" in result);
  const feasResult = hasResult ? (result as FeasibilityResult) : null;
  const errorMsg = result && "error" in result ? result.error : null;

  const maxHours = feasResult
    ? Math.max(...feasResult.weeks.map((w) => w.requiredHours), 1)
    : 1;

  const overallRatio = feasResult ? feasResult.feasibilityPercent / 100 : 0;
  const simulationWithRates =
    simulationActive && hasSimulationUtilizationData(simulationData) ? simulationData : null;
  const simulationCapacityRisk = simulationWithRates?.capacity_risk ?? false;
  const baselineCapacityRisk = simulationWithRates?.current_capacity_risk ?? false;
  const proposalIntroducesRisk = !baselineCapacityRisk && simulationCapacityRisk;
  const riskUnchanged = baselineCapacityRisk === simulationCapacityRisk;
  const [selectedProposedStaffIds, setSelectedProposedStaffIds] = useState<Set<string>>(new Set());
  const [splitPercentByStaff, setSplitPercentByStaff] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!feasResult) {
      setSelectedProposedStaffIds(new Set());
      setSplitPercentByStaff({});
      return;
    }
    const validIds = new Set(feasResult.staffCapacityCandidates.map((candidate) => candidate.id));
    setSelectedProposedStaffIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      if (next.size === prev.size) return prev;
      setSplitPercentByStaff(buildEqualSplit(Array.from(next)));
      return next;
    });
  }, [feasResult]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
        Calculating feasibility…
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        {errorMsg}
      </div>
    );
  }

  if (!feasResult) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        Run a simulation to view staffing feasibility.
      </div>
    );
  }

  const candidateById = new Map(
    feasResult.staffCapacityCandidates.map((candidate) => [candidate.id, candidate] as const)
  );
  const selectedStaff = Array.from(selectedProposedStaffIds)
    .map((id) => candidateById.get(id))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => a.name.localeCompare(b.name));
  const requiredSkills = feasResult.requiredSkills ?? [];
  const coveredSkillIds = new Set(
    selectedStaff.flatMap((candidate) => candidate.matchingSkillIds ?? [])
  );
  const coveredSkillCount = requiredSkills.filter((skill) => coveredSkillIds.has(skill.id)).length;
  const allRequiredSkillsCovered = coveredSkillCount === requiredSkills.length;
  const splitTotal = selectedStaff.reduce(
    (sum, candidate) => sum + (splitPercentByStaff[candidate.id] ?? 0),
    0
  );
  const splitIsValid = Math.abs(splitTotal - 100) < 0.1;

  function toggleProposedStaff(id: string) {
    const next = new Set(selectedProposedStaffIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    const ids = Array.from(next).sort();
    setSelectedProposedStaffIds(next);
    setSplitPercentByStaff(buildEqualSplit(ids));
  }

  function handleSplitChange(id: string, value: string) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(100, parsed));
    setSplitPercentByStaff((prev) => ({
      ...prev,
      [id]: round1(clamped),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="app-card p-4">
          <p className="text-xs font-medium text-zinc-500">Overall feasibility</p>
          <p className={`mt-1 text-2xl font-bold ${feasibilityTextColor(overallRatio)}`}>
            {feasResult.feasibilityPercent.toFixed(1)}%
          </p>
          <OverallBadge percent={feasResult.feasibilityPercent} />
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-medium text-zinc-500">Required hours</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{feasResult.totalRequired}h</p>
          <p className="text-xs text-zinc-400">across {feasResult.weeks.length} week{feasResult.weeks.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-medium text-zinc-500">Achievable hours</p>
          <p className={`mt-1 text-2xl font-bold ${feasibilityTextColor(overallRatio)}`}>
            {feasResult.totalAchievable}h
          </p>
          <p className="text-xs text-zinc-400">
            {Math.round(feasResult.totalRequired - feasResult.totalAchievable)}h shortfall
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-medium text-zinc-500">Staff in scope</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{feasResult.staffCount}</p>
          <p className="text-xs text-zinc-400">Based on the current office filter.</p>
        </div>
      </div>

      <div className="app-card-soft px-4 py-3">
        <p className="text-xs font-medium text-zinc-500">Selected objective</p>
        <p className="mt-1 text-sm font-medium text-zinc-800">{feasResult.optimizationLabel}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Uses {feasResult.staffUsedCount} staff and {feasResult.totalOverallocatedHours}h of overallocated time.
        </p>
        {feasResult.hasSkillDemandModel && (
          <p className="mt-1 text-xs text-zinc-500">
            Skill-demand model active: feasibility is computed against required hours/week per proposal skill.
          </p>
        )}
      </div>

      {feasResult.skillCoverage.length > 0 && (
        <div className="app-card p-4">
          <h3 className="text-sm font-semibold text-zinc-900">Skill coverage breakdown</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Shows required vs achievable hours per skill across the full proposal window.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Skill</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Required</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Achievable</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Shortfall</th>
                </tr>
              </thead>
              <tbody>
                {feasResult.skillCoverage.map((row) => (
                  <tr key={row.skillId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2 text-sm text-zinc-800">{row.skillName}</td>
                    <td className="px-3 py-2 text-right text-sm text-zinc-800">{row.requiredHours}h</td>
                    <td className="px-3 py-2 text-right text-sm text-zinc-800">{row.achievableHours}h</td>
                    <td className="px-3 py-2 text-right text-sm">
                      <span className={row.shortfallHours > 0 ? "text-red-700" : "text-emerald-700"}>
                        {row.shortfallHours}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="app-card p-4">
        <h3 className="text-sm font-semibold text-zinc-900">
          Recommended staff ({feasResult.recommendedStaff.length})
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Suggested from the selected allocation objective: {feasResult.optimizationLabel}
          {requiredSkills.length > 0
            ? ". Staff shown here match at least one required proposal skill."
            : "."}
        </p>
        {feasResult.recommendedStaff.length > 0 ? (
          <ul className="mt-3 divide-y divide-zinc-100">
            {feasResult.recommendedStaff.map((staff) => (
              <li key={staff.id} className="py-2">
                <Link href={`/staff/${staff.id}`} className="group block">
                  <p className="app-link text-sm font-medium text-zinc-900">{staff.name}</p>
                  <p className="text-xs text-zinc-600">
                    {staff.role} · {staff.office}
                  </p>
                  {requiredSkills.length > 0 && (
                    <p className="text-xs text-zinc-500">
                      Skills: {staff.matchingSkillNames.length > 0 ? staff.matchingSkillNames.join(", ") : "None"}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">
            No staff recommendations yet for the current timeframe and filters.
          </p>
        )}
      </div>

      <div className="app-card p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Proposed staffing plan</h3>
        <p className="mt-1 text-xs text-zinc-500">
          {requiredSkills.length > 0
            ? "Select staff to draft a delivery team. Candidates are filtered to staff who match at least one required skill."
            : "Select staff to draft a delivery team. Split defaults to equal shares and can be adjusted manually."}
        </p>
        {requiredSkills.length > 0 && (
          <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-medium text-zinc-700">
              Skill coverage: {coveredSkillCount}/{requiredSkills.length}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {requiredSkills.map((skill) => {
                const covered = coveredSkillIds.has(skill.id);
                return (
                  <span
                    key={skill.id}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      covered ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {skill.name}
                    {skill.requiredHoursPerWeek !== null ? ` ${skill.requiredHoursPerWeek}h/wk` : ""}
                    {" "}
                    {covered ? "(covered)" : "(missing)"}
                  </span>
                );
              })}
            </div>
            {!allRequiredSkillsCovered && (
              <p className="mt-2 text-xs text-amber-700">
                Add staff that collectively cover all required skills before finalizing the staffing plan.
              </p>
            )}
          </div>
        )}

        {feasResult.staffCapacityCandidates.length > 0 ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {feasResult.staffCapacityCandidates.map((candidate) => {
                const active = selectedProposedStaffIds.has(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => toggleProposedStaff(candidate.id)}
                    className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-500"
                    }`}
                    title={`${candidate.role} · ${candidate.office}${
                      requiredSkills.length > 0 && candidate.matchingSkillNames.length > 0
                        ? ` · Skills: ${candidate.matchingSkillNames.join(", ")}`
                        : ""
                    }`}
                  >
                    {candidate.name}
                  </button>
                );
              })}
            </div>

            {selectedStaff.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="app-table min-w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Staff</th>
                      {requiredSkills.length > 0 && (
                        <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Skill coverage</th>
                      )}
                      <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Available (no overalloc)</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Split %</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Assigned hours</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStaff.map((candidate) => {
                      const splitPct = splitPercentByStaff[candidate.id] ?? 0;
                      const assignedHours = round1((feasResult.totalRequired * splitPct) / 100);
                      const spareHours = round1(candidate.availableHoursWithoutOverallocation - assignedHours);
                      const canCover = spareHours >= 0;
                      return (
                        <tr key={candidate.id} className="border-b border-zinc-100 last:border-0">
                          <td className="px-3 py-2 text-sm text-zinc-800">
                            <p className="font-medium">{candidate.name}</p>
                            <p className="text-xs text-zinc-500">{candidate.role} · {candidate.office}</p>
                          </td>
                          {requiredSkills.length > 0 && (
                            <td className="px-3 py-2 text-sm text-zinc-700">
                              {candidate.matchingSkillNames.length > 0
                                ? candidate.matchingSkillNames.join(", ")
                                : "None"}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right text-sm text-zinc-800">
                            {candidate.availableHoursWithoutOverallocation}h
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={splitPct}
                              onChange={(e) => handleSplitChange(candidate.id, e.target.value)}
                              className="app-input w-20 px-2 py-1 text-right text-sm text-zinc-800"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-zinc-800">{assignedHours}h</td>
                          <td className="px-3 py-2 text-sm">
                            <span className={canCover ? "text-emerald-700" : "text-red-700"}>
                              {canCover ? `Can cover (+${spareHours}h)` : `Over by ${Math.abs(spareHours)}h`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(() => {
                  const hasOverallocationRisk = selectedStaff.some((candidate) => {
                    const splitPct = splitPercentByStaff[candidate.id] ?? 0;
                    const assignedHours = round1((feasResult.totalRequired * splitPct) / 100);
                    return candidate.availableHoursWithoutOverallocation - assignedHours < 0;
                  });
                  const planIsReady =
                    splitIsValid &&
                    !hasOverallocationRisk &&
                    (requiredSkills.length === 0 || allRequiredSkillsCovered);
                  return (
                    <div
                      className={`mt-2 rounded-md px-3 py-2 text-xs ${
                        planIsReady
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {planIsReady
                        ? "Plan is valid: split totals 100%, selected staff can cover assigned hours without overallocation, and required skills are covered."
                        : !splitIsValid
                          ? "Plan is invalid: split must total exactly 100% before this staffing plan can be considered ready."
                          : requiredSkills.length > 0 && !allRequiredSkillsCovered
                            ? "Plan needs adjustment: selected staff do not yet cover all required skills."
                          : "Plan needs adjustment: one or more selected staff are overallocated for the assigned hours."}
                    </div>
                  );
                })()}
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <p>
                    Split total: <span className={splitIsValid ? "text-emerald-700" : "text-red-700"}>{round1(splitTotal)}%</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setSplitPercentByStaff(buildEqualSplit(selectedStaff.map((staff) => staff.id)))}
                    className="app-btn app-btn-secondary focus-ring px-3 py-1 text-xs"
                  >
                    Rebalance equally
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Capacity check uses each staff member&apos;s available hours in this proposal window without overallocation.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">Pick one or more staff to build a proposed plan.</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">No staff are available in the current scope.</p>
        )}
      </div>

      {feasResult.comparisons && feasResult.comparisons.length > 0 && (
        <div className="app-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">Scenario comparison</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {feasResult.comparisons.map((comparison) => (
              <div key={comparison.mode} className="rounded-md border border-zinc-200 p-3 hover:bg-zinc-50">
                <p className="text-xs font-medium text-zinc-500">{comparison.label}</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {comparison.feasibilityPercent.toFixed(1)}%
                </p>
                <p className="text-xs text-zinc-500">
                  {comparison.totalAchievable}h / {comparison.totalRequired}h
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Staff used: {comparison.staffUsedCount} · Overallocated: {comparison.overallocatedHours}h
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {feasResult.weeks.length > 0 && (
        <div className="app-card p-4">
          <h3 className="mb-1 text-sm font-semibold text-zinc-900">Weekly capacity timeline</h3>
          <p className="mb-4 text-xs text-zinc-500">
            Bar height = required hours relative to the project&apos;s peak week. Fill = achievable portion.
            <span className="ml-2 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> ≥90%</span>
            <span className="ml-2 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> 50–89%</span>
            <span className="ml-2 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" /> &lt;50%</span>
            <span className="ml-2 inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> dot = at least one in-scope staff over 100% that week</span>
          </p>

          {simulationWithRates && (
            <div
              className={`mb-4 flex items-start gap-3 rounded-md px-4 py-3 text-sm ${
                proposalIntroducesRisk
                  ? "bg-red-50 text-red-800"
                  : simulationCapacityRisk
                    ? "bg-amber-50 text-amber-800"
                    : "bg-amber-50 text-amber-800"
              }`}
            >
              <span className="mt-0.5 shrink-0 text-base leading-none">
                {proposalIntroducesRisk ? "!" : "i"}
              </span>
              <div className="space-y-0.5">
                <p className="font-medium">
                  {proposalIntroducesRisk
                    ? "Proposal introduces capacity risk in this window"
                    : riskUnchanged && simulationCapacityRisk
                      ? "Capacity risk already exists before this proposal"
                      : "Simulation active — proposal accepted"}
                </p>
                <p>
                  Team utilization shifts from{" "}
                  <span className="font-semibold">
                    {(simulationWithRates.current_utilization * 100).toFixed(1)}%
                  </span>{" "}
                  to{" "}
                  <span className="font-semibold">
                    {(simulationWithRates.simulated_utilization * 100).toFixed(1)}%
                  </span>{" "}
                  avg across the proposal window.
                  {simulationWithRates.overload_week !== null && (
                    <>
                      {" "}
                      Team exceeds 90% utilization from week {simulationWithRates.overload_week}
                      {simulationWithRates.current_overload_week !== null
                        ? ` (current baseline week ${simulationWithRates.current_overload_week}).`
                        : "."}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="relative">
            <div
              className="flex items-end gap-1"
              style={{ height: "220px" }}
            >
              {feasResult.weeks.map((week) => (
                <WeekBar
                  key={week.weekStart}
                  week={week}
                  maxHours={maxHours}
                />
              ))}
            </div>

            {simulationWithRates && (
              <>
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-red-400"
                  style={{ bottom: `${simulationWithRates.simulated_utilization * 220}px` }}
                >
                  <span className="absolute right-0 -translate-y-full rounded-sm bg-red-400 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Simulated {(simulationWithRates.simulated_utilization * 100).toFixed(0)}%
                  </span>
                </div>
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-zinc-400"
                  style={{ bottom: `${simulationWithRates.current_utilization * 220}px` }}
                >
                  <span className="absolute left-0 -translate-y-full rounded-sm bg-zinc-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Current {(simulationWithRates.current_utilization * 100).toFixed(0)}%
                  </span>
                </div>
              </>
            )}

            {feasResult.weeks.length > 0 && (
              <div className="mt-1 flex gap-1 overflow-hidden">
                {feasResult.weeks.map((week, i) => {
                  const step = feasResult.weeks.length <= 12 ? 1 : feasResult.weeks.length <= 26 ? 2 : 4;
                  return (
                    <div
                      key={week.weekStart}
                      className="min-w-0 flex-1 text-center"
                    >
                      {i % step === 0 ? (
                        <span className="block truncate text-[10px] text-zinc-400">
                          {formatDate(week.weekStart)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
              <span>Cumulative project completion (hours basis)</span>
              <span className={`font-semibold ${feasibilityTextColor(overallRatio)}`}>
                {feasResult.feasibilityPercent.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all ${
                  overallRatio >= 0.9
                    ? "bg-emerald-500"
                    : overallRatio >= 0.5
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${Math.min(feasResult.feasibilityPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="app-card-soft px-4 py-3">
        <p className="mb-1 text-sm font-medium text-zinc-700">Capacity insight</p>
        <p className="text-sm text-zinc-600">{generateInsight(feasResult)}</p>
      </div>
    </div>
  );
}
