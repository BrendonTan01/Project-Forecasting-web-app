"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { computeFeasibility, type FeasibilityResult, type WeekFeasibility } from "./feasibility-actions";
import {
  PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS,
  PROPOSAL_OPTIMIZATION_MODE_LABELS,
  PROPOSAL_OPTIMIZATION_MODES,
  type ProposalOptimizationMode,
} from "../optimization-modes";

type Office = { id: string; name: string };

type Props = {
  proposalId: string;
  allOffices: Office[];
  initialOfficeScope: string[] | null;
  initialOptimizationMode: ProposalOptimizationMode;
  initialResult: FeasibilityResult | { error: string } | null;
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
      {/* Bar */}
      <div
        className="relative w-full min-w-[18px] rounded-t-sm bg-zinc-100"
        style={{ height: `${Math.max(barHeightPct, 14)}%`, minHeight: "10px" }}
      >
        <div
          className={`absolute bottom-0 left-0 right-0 rounded-t-sm transition-all ${color}`}
          style={{ height: `${fillPct}%` }}
        />
        {week.overallocatedStaffCount > 0 && (
          <div className="absolute -top-1 right-0 h-2 w-2 rounded-full bg-amber-400 ring-1 ring-white" title="Some staff would be above 100% allocation" />
        )}
      </div>

      {/* Tooltip */}
      {hovered && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg text-xs">
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
  allOffices,
  initialOfficeScope,
  initialOptimizationMode,
  initialResult,
}: Props) {
  const [allowOverallocation, setAllowOverallocation] = useState(false);
  const [maxOverallocationPercent, setMaxOverallocationPercent] = useState(120);
  const [optimizationMode, setOptimizationMode] = useState<ProposalOptimizationMode>(initialOptimizationMode);
  const initialSelectedOffices = initialOfficeScope ?? [];
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(() => new Set(initialSelectedOffices));
  const [limitToSelectedOffices, setLimitToSelectedOffices] = useState(initialSelectedOffices.length > 0);
  const [result, setResult] = useState<FeasibilityResult | { error: string } | null>(initialResult);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAnalysis = useCallback(
    (officeIds: Set<string>, overalloc: boolean, overallocPct: number, mode: ProposalOptimizationMode) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        startTransition(async () => {
          const ids = officeIds.size > 0 ? Array.from(officeIds) : null;
          const res = await computeFeasibility(proposalId, ids, overalloc, overallocPct, mode, true);
          setResult(res);
        });
      }, 300);
    },
    [proposalId]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function toggleOffice(id: string) {
    const next = new Set(selectedOffices);
    if (next.has(id)) {
      if (next.size === 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedOffices(next);
    scheduleAnalysis(next, allowOverallocation, maxOverallocationPercent, optimizationMode);
  }

  function handleOfficeScopeToggle(nextValue: boolean) {
    setLimitToSelectedOffices(nextValue);
    const officeSet = nextValue
      ? selectedOffices.size > 0
        ? selectedOffices
        : new Set(allOffices.length > 0 ? [allOffices[0].id] : [])
      : new Set<string>();
    if (nextValue && selectedOffices.size === 0 && officeSet.size > 0) {
      setSelectedOffices(new Set(officeSet));
    }
    scheduleAnalysis(officeSet, allowOverallocation, maxOverallocationPercent, optimizationMode);
  }

  function handleOverallocToggle(v: boolean) {
    setAllowOverallocation(v);
    scheduleAnalysis(limitToSelectedOffices ? selectedOffices : new Set<string>(), v, maxOverallocationPercent, optimizationMode);
  }

  function handleOverallocationPercentChange(v: string) {
    const parsed = Number.parseInt(v, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(200, Math.max(100, parsed));
    setMaxOverallocationPercent(clamped);
    scheduleAnalysis(limitToSelectedOffices ? selectedOffices : new Set<string>(), allowOverallocation, clamped, optimizationMode);
  }

  function handleModeChange(nextMode: ProposalOptimizationMode) {
    setOptimizationMode(nextMode);
    scheduleAnalysis(limitToSelectedOffices ? selectedOffices : new Set<string>(), allowOverallocation, maxOverallocationPercent, nextMode);
  }

  const hasResult = result && !("error" in result);
  const feasResult = hasResult ? (result as FeasibilityResult) : null;
  const errorMsg = result && "error" in result ? result.error : null;

  const maxHours = feasResult
    ? Math.max(...feasResult.weeks.map((w) => w.requiredHours), 1)
    : 1;

  const overallRatio = feasResult ? feasResult.feasibilityPercent / 100 : 0;
  const optimizationModesTooltip = PROPOSAL_OPTIMIZATION_MODES.map(
    (mode) => `${PROPOSAL_OPTIMIZATION_MODE_LABELS[mode]}: ${PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS[mode]}`
  ).join("\n");

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Office filter */}
        {allOffices.length > 1 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-zinc-700">Office scope:</span>
            <button
              type="button"
              role="switch"
              aria-checked={limitToSelectedOffices}
              onClick={() => handleOfficeScopeToggle(!limitToSelectedOffices)}
              className="app-toggle focus-ring"
              data-on={limitToSelectedOffices}
            >
              <span className="app-toggle-thumb" />
            </button>
            <span className="text-xs text-zinc-500">
              {limitToSelectedOffices ? "Selected offices only" : "All offices"}
            </span>
            {limitToSelectedOffices && (
              <div className="flex flex-wrap items-center gap-2">
                {allOffices.map((o) => {
                  const active = selectedOffices.has(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleOffice(o.id)}
                      className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 text-zinc-600 hover:border-zinc-500"
                      }`}
                    >
                      {o.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Overallocation toggle */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-zinc-700">Allow overallocation</span>
          <button
            type="button"
            role="switch"
            aria-checked={allowOverallocation}
            onClick={() => handleOverallocToggle(!allowOverallocation)}
            className="app-toggle focus-ring"
            data-on={allowOverallocation}
          >
            <span className="app-toggle-thumb" />
          </button>
        </div>
      </div>

      {allowOverallocation && (
        <div className="flex items-center gap-2">
          <label htmlFor="overallocation-limit" className="text-sm text-zinc-700">
            Max allocation limit
          </label>
          <div className="flex items-center gap-1">
            <input
              id="overallocation-limit"
              type="number"
              min={100}
              max={200}
              step={5}
              value={maxOverallocationPercent}
              onChange={(e) => handleOverallocationPercentChange(e.target.value)}
              className="app-input w-20 px-2 py-1 text-sm text-zinc-800"
            />
            <span className="text-sm text-zinc-500">%</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="analysis-mode" className="text-sm text-zinc-700">
          Allocation objective
        </label>
        <span
          className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-500"
          title={optimizationModesTooltip}
          aria-label="Show allocation objective descriptions"
        >
          ?
        </span>
        <select
          id="analysis-mode"
          value={optimizationMode}
          onChange={(e) => handleModeChange(e.target.value as ProposalOptimizationMode)}
          className="app-select w-auto px-2 py-1 text-sm text-zinc-800"
        >
          {PROPOSAL_OPTIMIZATION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {PROPOSAL_OPTIMIZATION_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-zinc-500">
        {PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS[optimizationMode]}
      </p>

      {allowOverallocation && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Overallocation mode: staff can exceed 100% up to {maxOverallocationPercent}% allocation.
          This reflects a capped over-allocation scenario, not unlimited capacity.
        </p>
      )}

      {isPending && (
        <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
          Calculating feasibility…
        </div>
      )}

      {!isPending && errorMsg && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {!isPending && feasResult && (
        <>
          {/* Summary stats */}
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
          </div>

          <div className="app-card p-4">
            <h3 className="text-sm font-semibold text-zinc-900">
              Recommended staff ({feasResult.recommendedStaff.length})
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Suggested from the selected allocation objective: {feasResult.optimizationLabel}.
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

          {/* Timeline */}
          {feasResult.weeks.length > 0 && (
            <div className="app-card p-4">
              <h3 className="mb-1 text-sm font-semibold text-zinc-900">Weekly capacity timeline</h3>
              <p className="mb-4 text-xs text-zinc-500">
                Bar height = required hours relative to the project&apos;s peak week. Fill = achievable portion.
                <span className="ml-2 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> ≥90%</span>
                <span className="ml-2 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> 50–89%</span>
                <span className="ml-2 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" /> &lt;50%</span>
              </p>

              {/* Chart area */}
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

                {/* X-axis labels — show every nth week to avoid crowding */}
                {feasResult.weeks.length > 0 && (
                  <div className="mt-1 flex gap-1 overflow-hidden">
                    {feasResult.weeks.map((week, i) => {
                      const step = feasResult.weeks.length <= 12 ? 1 : feasResult.weeks.length <= 26 ? 2 : 4;
                      return (
                        <div
                          key={week.weekStart}
                          className="flex-1 min-w-0 text-center"
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

              {/* Cumulative progress bar */}
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

          {/* Insight */}
          <div className="app-card-soft px-4 py-3">
            <p className="text-sm font-medium text-zinc-700 mb-1">Capacity insight</p>
            <p className="text-sm text-zinc-600">{generateInsight(feasResult)}</p>
          </div>
        </>
      )}
    </div>
  );
}
