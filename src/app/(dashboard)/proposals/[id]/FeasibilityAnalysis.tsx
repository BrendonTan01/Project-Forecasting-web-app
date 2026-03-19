"use client";

import { useState } from "react";
import {
  computeSuggestedSplitForTeam,
  type FeasibilityResult,
  type WeekFeasibility,
} from "./feasibility-actions";
import type { SimulationResult } from "./ProposalImpactPanel";
import { saveProposedTeam } from "../actions";
import type { ProposalOptimizationMode } from "../optimization-modes";

type SavedTeamMember = { staff_id: string; split_percent: number };

type Props = {
  proposalId: string;
  result: FeasibilityResult | { error: string } | null;
  isPending?: boolean;
  simulationActive?: boolean;
  simulationData?: SimulationResult | null;
  savedTeam?: SavedTeamMember[] | null;
  officeScope?: string[] | null;
  allowOverallocation?: boolean;
  maxOverallocationPercent?: number;
  optimizationMode?: ProposalOptimizationMode;
  includeManagers?: boolean;
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

// Thresholds to decide whether scenario comparison cards are meaningful.
// Tune these values to make comparisons more or less sensitive.
const SCENARIO_DIFF_THRESHOLDS = {
  feasibilityPercent: 1, // percentage points
  achievableHours: 5, // hours
  overallocatedHours: 5, // hours
  staffUsedCount: 2, // people
} as const;

const IMPACT_WEIGHTS = {
  skillCount: 20,
  skillHoursPerWeek: 0.8,
  noNewSkillPenalty: 10,
  spareCapacityPerHour: 0.45,
  spareCapacityCap: 20,
  overallocPerHour: 1.6,
  overallocCap: 45,
  objectiveAlignment: 8,
  objectiveMisalignment: 8,
  officeFitBonusStrong: 12,
  officeMismatchPenaltyStrong: 12,
  officeFitBonusSoft: 3,
  officeMismatchPenaltySoft: 2,
  alreadySelected: 4,
} as const;

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

function buildNormalizedSplitFromWeights(
  ids: string[],
  weightsById: Record<string, number>
): Record<string, number> {
  if (ids.length === 0) return {};
  const weights = ids.map((id) => Math.max(0, weightsById[id] ?? 0));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return buildEqualSplit(ids);

  const split: Record<string, number> = {};
  for (const id of ids) {
    split[id] = round1(((weightsById[id] ?? 0) / totalWeight) * 100);
  }
  const total = Object.values(split).reduce((sum, value) => sum + value, 0);
  const remainder = round1(100 - total);
  split[ids[ids.length - 1]] = round1(split[ids[ids.length - 1]] + remainder);
  return split;
}

function buildInitialPlanState(
  feasResult: FeasibilityResult | null,
  savedTeam: SavedTeamMember[] | null
): { selectedIds: Set<string>; splitByStaff: Record<string, number> } {
  if (!feasResult) {
    return { selectedIds: new Set(), splitByStaff: {} };
  }

  const validIds = new Set(feasResult.staffCapacityCandidates.map((candidate) => candidate.id));
  if (savedTeam && savedTeam.length > 0) {
    const savedIds = savedTeam
      .filter((member) => validIds.has(member.staff_id))
      .map((member) => member.staff_id);
    if (savedIds.length > 0) {
      const savedSplit: Record<string, number> = {};
      for (const member of savedTeam) {
        if (validIds.has(member.staff_id)) {
          savedSplit[member.staff_id] = member.split_percent;
        }
      }
      return { selectedIds: new Set(savedIds), splitByStaff: savedSplit };
    }
  }

  if (feasResult.proposedStaffingPlan.length > 0) {
    const planIds = feasResult.proposedStaffingPlan
      .map((member) => member.staff_id)
      .filter((id) => validIds.has(id));
    if (planIds.length > 0) {
      const planSplit: Record<string, number> = {};
      for (const member of feasResult.proposedStaffingPlan) {
        if (validIds.has(member.staff_id)) {
          planSplit[member.staff_id] = member.split_percent;
        }
      }
      return { selectedIds: new Set(planIds), splitByStaff: planSplit };
    }
  }

  return { selectedIds: new Set(), splitByStaff: {} };
}

function buildSuggestedPlanState(
  feasResult: FeasibilityResult | null
): { selectedIds: Set<string>; splitByStaff: Record<string, number> } {
  if (!feasResult || feasResult.proposedStaffingPlan.length === 0) {
    return { selectedIds: new Set(), splitByStaff: {} };
  }

  const validIds = new Set(feasResult.staffCapacityCandidates.map((candidate) => candidate.id));
  const suggestedIds = feasResult.proposedStaffingPlan
    .map((member) => member.staff_id)
    .filter((id) => validIds.has(id));
  if (suggestedIds.length === 0) {
    return { selectedIds: new Set(), splitByStaff: {} };
  }

  const suggestedSplit: Record<string, number> = {};
  for (const member of feasResult.proposedStaffingPlan) {
    if (validIds.has(member.staff_id)) {
      suggestedSplit[member.staff_id] = member.split_percent;
    }
  }
  return { selectedIds: new Set(suggestedIds), splitByStaff: suggestedSplit };
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
  proposalId,
  result,
  isPending = false,
  simulationActive = false,
  simulationData = null,
  savedTeam = null,
  officeScope = null,
  allowOverallocation = false,
  maxOverallocationPercent = 120,
  optimizationMode,
  includeManagers = true,
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
  const initialPlanState = buildInitialPlanState(feasResult, savedTeam);
  const [selectedProposedStaffIds, setSelectedProposedStaffIds] = useState<Set<string>>(
    () => initialPlanState.selectedIds
  );
  const [splitPercentByStaff, setSplitPercentByStaff] = useState<Record<string, number>>(
    () => initialPlanState.splitByStaff
  );
  const [teamSaveStatus, setTeamSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [teamSaveError, setTeamSaveError] = useState<string | null>(null);
  const [teamIsDirty, setTeamIsDirty] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "restored">("idle");
  const [rebalanceOptionsOpen, setRebalanceOptionsOpen] = useState(false);
  const [suggestedRebalanceStatus, setSuggestedRebalanceStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [suggestedRebalanceError, setSuggestedRebalanceError] = useState<string | null>(null);

  async function handleSaveTeam() {
    setTeamSaveStatus("saving");
    setTeamSaveError(null);
    const team = Array.from(selectedProposedStaffIds).map((id) => ({
      staff_id: id,
      split_percent: splitPercentByStaff[id] ?? 0,
    }));
    const result = await saveProposedTeam(proposalId, team);
    if (result.error) {
      setTeamSaveStatus("error");
      setTeamSaveError(result.error);
      return;
    }
    setTeamSaveStatus("saved");
    setTeamIsDirty(false);
    setTimeout(() => setTeamSaveStatus("idle"), 3000);
  }

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
  const scenarioComparisons = feasResult.comparisons ?? [];
  const officeHotspots = feasResult.officeCapacityHotspots ?? [];
  const hasSuggestedPlan = feasResult.proposedStaffingPlan.length > 0;
  const meaningfulComparisons = scenarioComparisons.filter((comparison) => {
    const feasibilityDelta = Math.abs(comparison.feasibilityPercent - feasResult.feasibilityPercent);
    const achievableDelta = Math.abs(comparison.totalAchievable - feasResult.totalAchievable);
    const overallocDelta = Math.abs(comparison.overallocatedHours - feasResult.totalOverallocatedHours);
    const staffUsedDelta = Math.abs(comparison.staffUsedCount - feasResult.staffUsedCount);

    return (
      feasibilityDelta >= SCENARIO_DIFF_THRESHOLDS.feasibilityPercent ||
      achievableDelta >= SCENARIO_DIFF_THRESHOLDS.achievableHours ||
      overallocDelta >= SCENARIO_DIFF_THRESHOLDS.overallocatedHours ||
      staffUsedDelta >= SCENARIO_DIFF_THRESHOLDS.staffUsedCount
    );
  });

  function toggleProposedStaff(id: string) {
    const next = new Set(selectedProposedStaffIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    const ids = Array.from(next).sort();
    const weightsById: Record<string, number> = {};
    for (const candidateId of ids) {
      const existing = splitPercentByStaff[candidateId];
      const suggested = candidateById.get(candidateId)?.recommendedSplitPercent ?? 0;
      weightsById[candidateId] = existing && existing > 0 ? existing : suggested;
    }
    setSelectedProposedStaffIds(next);
    setSplitPercentByStaff(buildNormalizedSplitFromWeights(ids, weightsById));
    setTeamIsDirty(true);
  }

  function handleSplitChange(id: string, value: string) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(100, parsed));
    setSplitPercentByStaff((prev) => ({
      ...prev,
      [id]: round1(clamped),
    }));
    setTeamIsDirty(true);
  }

  function handleRestoreSuggestedPlan() {
    const suggested = buildSuggestedPlanState(feasResult);
    setSelectedProposedStaffIds(suggested.selectedIds);
    setSplitPercentByStaff(suggested.splitByStaff);
    setTeamIsDirty(true);
    setRestoreStatus("restored");
    setTimeout(() => setRestoreStatus("idle"), 3000);
  }

  function handleRebalanceEqually() {
    setSplitPercentByStaff(buildEqualSplit(selectedStaff.map((staff) => staff.id)));
    setTeamIsDirty(true);
    setRebalanceOptionsOpen(false);
  }

  async function handleRebalanceSuggested() {
    const ids = selectedStaff.map((staff) => staff.id).sort();
    if (ids.length === 0) return;

    setSuggestedRebalanceStatus("running");
    setSuggestedRebalanceError(null);

    const splitResult = await computeSuggestedSplitForTeam(
      proposalId,
      ids,
      officeScope,
      allowOverallocation,
      maxOverallocationPercent,
      optimizationMode ?? feasResult.optimizationMode,
      includeManagers
    );

    if ("error" in splitResult) {
      setSuggestedRebalanceStatus("error");
      setSuggestedRebalanceError(splitResult.error);
      return;
    }

    setSplitPercentByStaff((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = splitResult.splitByStaffId[id] ?? 0;
      }
      return next;
    });
    setTeamIsDirty(true);
    setSuggestedRebalanceStatus("done");
    setTimeout(() => setSuggestedRebalanceStatus("idle"), 3000);
    setRebalanceOptionsOpen(false);
  }

  function getCandidateImpact(candidateId: string): {
    score: number;
    label: "Helps" | "Mixed" | "Detracts";
    reasons: string[];
  } {
    if (!feasResult) return { score: 0, label: "Mixed", reasons: [] };
    const candidate = candidateById.get(candidateId);
    if (!candidate) return { score: 0, label: "Mixed", reasons: [] };

    const alreadySelected = selectedProposedStaffIds.has(candidateId);
    const selectedWithoutCandidate = selectedStaff.filter((member) => member.id !== candidateId);
    const selectedOfficeCounts = new Map<string, number>();
    for (const member of selectedWithoutCandidate) {
      selectedOfficeCounts.set(member.office, (selectedOfficeCounts.get(member.office) ?? 0) + 1);
    }
    let dominantSelectedOffice: string | null = null;
    let dominantSelectedOfficeCount = 0;
    for (const [office, count] of selectedOfficeCounts.entries()) {
      if (count > dominantSelectedOfficeCount) {
        dominantSelectedOffice = office;
        dominantSelectedOfficeCount = count;
      }
    }
    const coveredBySelection = new Set(
      selectedWithoutCandidate.flatMap((member) => member.matchingSkillIds ?? [])
    );
    const uncoveredRequiredSkills = requiredSkills.filter((skill) => !coveredBySelection.has(skill.id));
    const newlyCoveredSkills = uncoveredRequiredSkills.filter((skill) =>
      (candidate.matchingSkillIds ?? []).includes(skill.id)
    );
    const newlyCoveredSkillHoursPerWeek = newlyCoveredSkills.reduce(
      (sum, skill) => sum + (skill.requiredHoursPerWeek ?? 0),
      0
    );

    const projectedAssignedHours = candidate.projectedAssignedHours > 0
      ? candidate.projectedAssignedHours
      : round1((feasResult.totalRequired * Math.max(candidate.recommendedSplitPercent, 10)) / 100);
    const overallocHours = Math.max(0, projectedAssignedHours - candidate.availableHoursWithoutOverallocation);
    const spareHours = Math.max(0, candidate.availableHoursWithoutOverallocation - projectedAssignedHours);
    let score = 0;
    const reasons: string[] = [];

    if (newlyCoveredSkills.length > 0) {
      const skillScore =
        newlyCoveredSkills.length * IMPACT_WEIGHTS.skillCount +
        newlyCoveredSkillHoursPerWeek * IMPACT_WEIGHTS.skillHoursPerWeek;
      score += skillScore;
      reasons.push(`Covers ${newlyCoveredSkills.length} currently missing skill${newlyCoveredSkills.length > 1 ? "s" : ""}`);
    } else if (requiredSkills.length > 0) {
      score -= IMPACT_WEIGHTS.noNewSkillPenalty;
      reasons.push("Adds little new skill coverage for current roster");
    }

    if (spareHours > 0) {
      const capacityScore = Math.min(
        IMPACT_WEIGHTS.spareCapacityCap,
        spareHours * IMPACT_WEIGHTS.spareCapacityPerHour
      );
      score += capacityScore;
      reasons.push(`Has ${round1(spareHours)}h headroom at suggested load`);
    }

    if (overallocHours > 0) {
      const penalty = Math.min(
        IMPACT_WEIGHTS.overallocCap,
        overallocHours * IMPACT_WEIGHTS.overallocPerHour
      );
      score -= penalty;
      reasons.push(`Would likely overallocate by ${round1(overallocHours)}h`);
    }

    if (candidate.recommendedSplitPercent > 0) {
      score += IMPACT_WEIGHTS.objectiveAlignment;
      reasons.push(`Included by simulation objective (${candidate.recommendedSplitPercent}%)`);
    } else if (feasResult.optimizationMode === "min_staff_count" && !alreadySelected) {
      score -= IMPACT_WEIGHTS.objectiveMisalignment;
      reasons.push("May conflict with current objective to minimize staff count");
    }

    if (dominantSelectedOffice && selectedWithoutCandidate.length > 0) {
      if (feasResult.optimizationMode === "single_office_preferred") {
        if (candidate.office === dominantSelectedOffice) {
          score += IMPACT_WEIGHTS.officeFitBonusStrong;
          reasons.push(`Office fit: strongly aligns with single-office objective (${dominantSelectedOffice})`);
        } else {
          score -= IMPACT_WEIGHTS.officeMismatchPenaltyStrong;
          reasons.push(`Office fit: conflicts with single-office objective (${dominantSelectedOffice})`);
        }
      } else if (feasResult.optimizationMode !== "multi_office_balanced") {
        if (candidate.office === dominantSelectedOffice) {
          score += IMPACT_WEIGHTS.officeFitBonusSoft;
          reasons.push(`Office fit: aligns with current roster concentration (${dominantSelectedOffice})`);
        } else {
          score -= IMPACT_WEIGHTS.officeMismatchPenaltySoft;
          reasons.push(`Office fit: broadens office mix from current roster (${dominantSelectedOffice})`);
        }
      }
    }

    if (alreadySelected) {
      score += IMPACT_WEIGHTS.alreadySelected;
    }

    const roundedScore = Math.round(score);
    const label =
      roundedScore >= 18 ? "Helps" : roundedScore <= -12 ? "Detracts" : "Mixed";
    return { score: roundedScore, label, reasons };
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
        {officeHotspots.length > 0 && (
          <p className="mt-1 text-xs text-amber-700">
            Office hotspot guard active: recommendations de-prioritise staff from high-utilisation offices where possible ({officeHotspots
              .slice(0, 3)
              .map((office) => office.officeName)
              .join(", ")}).
          </p>
        )}
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
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Proposed staffing plan</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {requiredSkills.length > 0
                ? "Select staff to draft a delivery team. Candidates are filtered to staff who match at least one required skill."
                : "Select staff to draft a delivery team. Split defaults to equal shares and can be adjusted manually."}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Initial splits are generated by simulation settings ({feasResult.optimizationLabel}) and can be edited before saving.
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              Use &quot;Save staffing plan&quot; to persist this roster to the proposal — it will be preserved across simulation runs and carried over when converting to a project.
            </p>
          </div>
          {selectedProposedStaffIds.size > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              {teamIsDirty && (
                <span className="text-xs text-amber-600">Unsaved changes</span>
              )}
              {teamSaveStatus === "saved" && !teamIsDirty && (
                <span className="text-xs text-emerald-600">Saved</span>
              )}
              <button
                type="button"
                onClick={handleSaveTeam}
                disabled={teamSaveStatus === "saving"}
                className="app-btn app-btn-primary focus-ring px-3 py-1.5 text-xs"
              >
                {teamSaveStatus === "saving" ? "Saving…" : "Save staffing plan"}
              </button>
            </div>
          )}
        </div>
        {teamSaveError && (
          <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{teamSaveError}</p>
        )}
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
                const impact = getCandidateImpact(candidate.id);
                const impactColor =
                  impact.label === "Helps"
                    ? "text-emerald-700"
                    : impact.label === "Detracts"
                      ? "text-red-700"
                      : "text-amber-700";
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
                    }${impact.reasons.length > 0 ? ` · ${impact.reasons.join(" · ")}` : ""}`}
                  >
                    {candidate.name}
                    <span className={`ml-2 inline-flex rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold ${impactColor}`}>
                      {impact.label} {impact.score >= 0 ? `+${impact.score}` : impact.score}
                    </span>
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
                      const impact = getCandidateImpact(candidate.id);
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
                            {impact.reasons.length > 0 && (
                              <p className="mt-0.5 text-xs text-zinc-500">
                                {impact.reasons.slice(0, 2).join(" · ")}
                              </p>
                            )}
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
                  <div className="flex items-center gap-2">
                    {restoreStatus === "restored" && (
                      <span className="text-xs text-emerald-600">Suggested plan restored</span>
                    )}
                    {suggestedRebalanceStatus === "done" && (
                      <span className="text-xs text-emerald-600">Simulation rebalance applied</span>
                    )}
                    <button
                      type="button"
                      onClick={handleRestoreSuggestedPlan}
                      disabled={!hasSuggestedPlan}
                      className="app-btn app-btn-secondary focus-ring px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Restore suggested plan
                    </button>
                    <button
                      type="button"
                      onClick={() => setRebalanceOptionsOpen((prev) => !prev)}
                      className="app-btn app-btn-secondary focus-ring px-3 py-1 text-xs"
                    >
                      Rebalance split
                    </button>
                  </div>
                </div>
                {rebalanceOptionsOpen && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleRebalanceEqually}
                      className="app-btn app-btn-secondary focus-ring px-3 py-1 text-xs"
                    >
                      Rebalance equally
                    </button>
                    <button
                      type="button"
                      onClick={handleRebalanceSuggested}
                      disabled={suggestedRebalanceStatus === "running"}
                      className="app-btn app-btn-secondary focus-ring px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {suggestedRebalanceStatus === "running"
                        ? "Rebalancing from simulation..."
                        : "Rebalance from simulation suggestion"}
                    </button>
                  </div>
                )}
                {suggestedRebalanceError && (
                  <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    {suggestedRebalanceError}
                  </p>
                )}
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

      {scenarioComparisons.length > 0 && (
        <div className="app-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">Scenario comparison</h3>
          {meaningfulComparisons.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {meaningfulComparisons.map((comparison) => (
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
          ) : (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Alternative objectives produced equivalent outcomes in this scenario, so comparison cards are hidden.
            </p>
          )}
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
                  style={{ bottom: `${Math.min(simulationWithRates.simulated_utilization, 1) * 220}px` }}
                >
                  <span className={`absolute right-0 rounded-sm bg-red-400 px-1.5 py-0.5 text-[10px] font-medium text-white ${simulationWithRates.simulated_utilization > 1 ? "translate-y-0" : "-translate-y-full"}`}>
                    Simulated {(simulationWithRates.simulated_utilization * 100).toFixed(0)}%
                  </span>
                </div>
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-zinc-400"
                  style={{ bottom: `${Math.min(simulationWithRates.current_utilization, 1) * 220}px` }}
                >
                  <span className={`absolute left-0 rounded-sm bg-zinc-500 px-1.5 py-0.5 text-[10px] font-medium text-white ${simulationWithRates.current_utilization > 1 ? "translate-y-0" : "-translate-y-full"}`}>
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
