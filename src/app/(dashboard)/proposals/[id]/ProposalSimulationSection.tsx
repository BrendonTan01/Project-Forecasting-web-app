"use client";

import { useState, useEffect } from "react";
import { FeasibilityAnalysis } from "./FeasibilityAnalysis";
import { ProposalImpactPanel, type SimulationResult } from "./ProposalImpactPanel";
import { computeFeasibility, type FeasibilityResult } from "./feasibility-actions";
import {
  PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS,
  PROPOSAL_OPTIMIZATION_MODE_LABELS,
  PROPOSAL_OPTIMIZATION_MODES,
  PROPOSAL_OPTIMIZATION_OFFICE_MODES,
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

function normalizeScopeKey(scope: string[] | null): string {
  if (!scope || scope.length === 0) return "";
  return [...scope].sort().join(",");
}

function normalizeInputKey(input: {
  scope: string[] | null;
  optimizationMode: ProposalOptimizationMode;
  allowOverallocation: boolean;
  maxOverallocationPercent: number;
  includeManagers: boolean;
}): string {
  return [
    normalizeScopeKey(input.scope),
    input.optimizationMode,
    input.allowOverallocation ? "1" : "0",
    String(input.maxOverallocationPercent),
    input.includeManagers ? "1" : "0",
  ].join("|");
}

export function ProposalSimulationSection({
  proposalId,
  allOffices,
  initialOfficeScope,
  initialOptimizationMode,
  initialResult,
}: Props) {
  const proposalScopedOfficeIds = (initialOfficeScope ?? []).filter((id) =>
    allOffices.some((office) => office.id === id)
  );
  const isProposalOfficeScoped = proposalScopedOfficeIds.length > 0;
  const selectableOffices = isProposalOfficeScoped
    ? allOffices.filter((office) => proposalScopedOfficeIds.includes(office.id))
    : allOffices;
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(() => {
    if (isProposalOfficeScoped) {
      return new Set(proposalScopedOfficeIds.length > 0 ? [proposalScopedOfficeIds[0]] : []);
    }
    return new Set(initialOfficeScope ?? []);
  });
  const [limitToSelectedOffices, setLimitToSelectedOffices] = useState(!isProposalOfficeScoped);
  const [allowOverallocation, setAllowOverallocation] = useState(false);
  const [maxOverallocationPercent, setMaxOverallocationPercent] = useState(120);
  const [includeManagers, setIncludeManagers] = useState(true);
  const [optimizationMode, setOptimizationMode] = useState<ProposalOptimizationMode>(initialOptimizationMode);

  const [simulationActive, setSimulationActive] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [impactData, setImpactData] = useState<SimulationResult | null>(null);
  const [feasibilityResult, setFeasibilityResult] = useState<FeasibilityResult | { error: string } | null>(initialResult);
  const [feasibilityLoading, setFeasibilityLoading] = useState(false);
  const [lastRunInputKey, setLastRunInputKey] = useState<string | null>(null);

  const effectiveOfficeScope =
    isProposalOfficeScoped
      ? limitToSelectedOffices
        ? selectedOffices.size > 0
          ? Array.from(selectedOffices)
          : selectableOffices.length > 0
            ? [selectableOffices[0].id]
            : null
        : proposalScopedOfficeIds
      : limitToSelectedOffices
        ? selectedOffices.size > 0
          ? Array.from(selectedOffices)
          : selectableOffices.length > 0
            ? [selectableOffices[0].id]
            : null
        : null;

  // Number of distinct offices currently in scope — used to decide which objectives make sense.
  const effectiveOfficeCount = effectiveOfficeScope
    ? effectiveOfficeScope.length
    : selectableOffices.length;

  // Office-specific objectives are meaningless when only one office is in scope.
  const visibleModes = PROPOSAL_OPTIMIZATION_MODES.filter((mode) => {
    if (PROPOSAL_OPTIMIZATION_OFFICE_MODES.includes(mode) && effectiveOfficeCount <= 1) {
      return false;
    }
    return true;
  });

  // If the selected mode is an office-specific one and scope has narrowed to 1 office, reset to default.
  useEffect(() => {
    if (PROPOSAL_OPTIMIZATION_OFFICE_MODES.includes(optimizationMode) && effectiveOfficeCount <= 1) {
      setOptimizationMode("max_feasibility");
    }
  }, [optimizationMode, effectiveOfficeCount]);

  const scopeLabel =
    effectiveOfficeScope && effectiveOfficeScope.length > 0
      ? allOffices
          .filter((office) => effectiveOfficeScope.includes(office.id))
          .map((office) => office.name)
          .join(", ")
      : "All offices";

  const currentInputKey = normalizeInputKey({
    scope: effectiveOfficeScope,
    optimizationMode,
    allowOverallocation,
    maxOverallocationPercent,
    includeManagers,
  });

  const simulationStale =
    simulationActive && lastRunInputKey !== null && lastRunInputKey !== currentInputKey;

  function toggleOffice(id: string) {
    if (isProposalOfficeScoped) {
      setSelectedOffices(new Set([id]));
      return;
    }
    const next = new Set(selectedOffices);
    if (next.has(id)) {
      if (next.size === 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedOffices(next);
  }

  function handleOfficeScopeToggle(nextValue: boolean) {
    setLimitToSelectedOffices(nextValue);
    if (nextValue && selectedOffices.size === 0 && selectableOffices.length > 0) {
      setSelectedOffices(new Set([selectableOffices[0].id]));
      return;
    }
    if (nextValue && isProposalOfficeScoped && selectedOffices.size > 1) {
      setSelectedOffices(new Set([Array.from(selectedOffices)[0]]));
    }
  }

  function handleOverallocationPercentChange(v: string) {
    const parsed = Number.parseInt(v, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(200, Math.max(100, parsed));
    setMaxOverallocationPercent(clamped);
  }

  async function handleRunFullSimulation() {
    setSimulationLoading(true);
    setFeasibilityLoading(true);
    setSimulationError(null);
    try {
      const params = new URLSearchParams({ proposalId });
      if (effectiveOfficeScope && effectiveOfficeScope.length > 0) {
        params.set("officeIds", effectiveOfficeScope.join(","));
      }

      const [impactResponse, feasibility] = await Promise.all([
        fetch(`/api/proposal-impact?${params.toString()}`),
        computeFeasibility(
          proposalId,
          effectiveOfficeScope,
          allowOverallocation,
          maxOverallocationPercent,
          optimizationMode,
          true,
          includeManagers
        ),
      ]);

      if (!impactResponse.ok) {
        const payload = (await impactResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to run simulation");
      }

      const impact = (await impactResponse.json()) as SimulationResult;
      setImpactData(impact);
      setFeasibilityResult(feasibility);
      setSimulationActive(true);
      setLastRunInputKey(currentInputKey);
    } catch (err: unknown) {
      setSimulationError(err instanceof Error ? err.message : "Failed to run simulation");
    } finally {
      setSimulationLoading(false);
      setFeasibilityLoading(false);
    }
  }

  function handleResetSimulation() {
    setSimulationActive(false);
    setImpactData(null);
    setFeasibilityResult(initialResult);
    setLastRunInputKey(null);
    setSimulationError(null);
  }

  const optimizationModesTooltip = visibleModes
    .map((mode) => `${PROPOSAL_OPTIMIZATION_MODE_LABELS[mode]}: ${PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS[mode]}`)
    .join("\n");

  return (
    <div className="space-y-4">
      <div className="app-card p-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-zinc-900">Simulation settings</h2>
          <p className="text-sm text-zinc-500">
            Configure one scenario, then run full simulation to update both acceptance impact and staffing feasibility.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Office scope affects both analyses. Allocation objective and overallocation settings affect staffing feasibility.
          </p>
          {isProposalOfficeScoped && (
            <p className="mt-1 text-xs text-zinc-500">
              Office choices are limited by this proposal&apos;s office scope.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {selectableOffices.length > 1 && (
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
                {limitToSelectedOffices
                  ? isProposalOfficeScoped
                    ? "Single scoped office"
                    : "Selected offices only"
                  : isProposalOfficeScoped
                    ? "All scoped offices"
                    : "All offices"}
              </span>
              {limitToSelectedOffices && (
                <div className="flex flex-wrap items-center gap-2">
                  {selectableOffices.map((office) => {
                    const active = selectedOffices.has(office.id);
                    return (
                      <button
                        key={office.id}
                        type="button"
                        onClick={() => toggleOffice(office.id)}
                        className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-300 text-zinc-600 hover:border-zinc-500"
                        }`}
                      >
                        {office.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-zinc-700">Allow overallocation</span>
            <button
              type="button"
              role="switch"
              aria-checked={allowOverallocation}
              onClick={() => setAllowOverallocation((prev) => !prev)}
              className="app-toggle focus-ring"
              data-on={allowOverallocation}
            >
              <span className="app-toggle-thumb" />
            </button>
          </div>
        </div>

        {allowOverallocation && (
          <div className="mt-3 flex items-center gap-2">
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

        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-zinc-700">Include managers in pool</span>
          <button
            type="button"
            role="switch"
            aria-checked={includeManagers}
            onClick={() => setIncludeManagers((prev) => !prev)}
            className="app-toggle focus-ring"
            data-on={includeManagers}
          >
            <span className="app-toggle-thumb" />
          </button>
          <span className="text-xs text-zinc-500">
            {includeManagers ? "Managers and staff included" : "Staff only"}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
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
            onChange={(e) => setOptimizationMode(e.target.value as ProposalOptimizationMode)}
            className="app-select w-auto px-2 py-1 text-sm text-zinc-800"
          >
            {visibleModes.map((mode) => (
              <option key={mode} value={mode}>
                {PROPOSAL_OPTIMIZATION_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS[optimizationMode]}
        </p>
        {effectiveOfficeCount <= 1 && (
          <p className="mt-1 text-xs text-zinc-400">
            Office-specific objectives are hidden — only one office is in scope.
          </p>
        )}
      </div>

      <ProposalImpactPanel
        officeScopeLabel={scopeLabel}
        simulationStale={simulationStale}
        onRunSimulation={handleRunFullSimulation}
        onResetSimulation={handleResetSimulation}
        simulationActive={simulationActive}
        simulationData={impactData}
        loading={simulationLoading}
        error={simulationError}
      />

      <div className="app-card p-4">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-zinc-900">Staffing feasibility breakdown</h2>
          <p className="text-sm text-zinc-500">
            Simulates how much of this project can be absorbed by current staff, accounting for
            existing project commitments and approved leave.
          </p>
        </div>
        <FeasibilityAnalysis
          result={feasibilityResult}
          isPending={feasibilityLoading}
          simulationActive={simulationActive}
          simulationData={impactData}
        />
      </div>
    </div>
  );
}
