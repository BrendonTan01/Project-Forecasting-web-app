"use client";

import { useState } from "react";
import { FeasibilityAnalysis } from "./FeasibilityAnalysis";
import { ProposalImpactPanel, type SimulationResult } from "./ProposalImpactPanel";
import type { FeasibilityResult } from "./feasibility-actions";
import type { ProposalOptimizationMode } from "../optimization-modes";

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

export function ProposalSimulationSection({
  proposalId,
  allOffices,
  initialOfficeScope,
  initialOptimizationMode,
  initialResult,
}: Props) {
  const [simulationActive, setSimulationActive] = useState(false);
  const [impactData, setImpactData] = useState<SimulationResult | null>(null);
  const [effectiveOfficeScope, setEffectiveOfficeScope] = useState<string[] | null>(initialOfficeScope);
  const [lastSimulatedScopeKey, setLastSimulatedScopeKey] = useState<string | null>(null);
  const [lastSimulatedScopeLabel, setLastSimulatedScopeLabel] = useState<string | null>(null);
  const scopeLabel =
    effectiveOfficeScope && effectiveOfficeScope.length > 0
      ? allOffices
          .filter((office) => effectiveOfficeScope.includes(office.id))
          .map((office) => office.name)
          .join(", ")
      : "All offices";
  const currentScopeKey = normalizeScopeKey(effectiveOfficeScope);
  const simulationStale =
    impactData !== null && lastSimulatedScopeKey !== null && lastSimulatedScopeKey !== currentScopeKey;

  function handleSimulateAccept(data: SimulationResult) {
    setImpactData(data);
    setSimulationActive(true);
    setLastSimulatedScopeKey(currentScopeKey);
    setLastSimulatedScopeLabel(scopeLabel);
  }

  function handleSimulateReject() {
    setSimulationActive(false);
    setImpactData(null);
    setLastSimulatedScopeKey(null);
    setLastSimulatedScopeLabel(null);
  }

  return (
    <div className="space-y-4">
      <ProposalImpactPanel
        proposalId={proposalId}
        officeScopeIds={effectiveOfficeScope}
        officeScopeLabel={scopeLabel}
        simulationStale={simulationStale}
        staleScopeLabel={lastSimulatedScopeLabel}
        onSimulateAccept={handleSimulateAccept}
        onResetSimulation={handleSimulateReject}
        simulationActive={simulationActive}
        simulationData={impactData}
      />

      <div className="app-card p-4">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-zinc-900">Staff feasibility analysis</h2>
          <p className="text-sm text-zinc-500">
            Simulates how much of this project can be absorbed by current staff, accounting for
            existing project commitments and approved leave.
          </p>
        </div>
        <FeasibilityAnalysis
          proposalId={proposalId}
          allOffices={allOffices}
          initialOfficeScope={initialOfficeScope}
          initialOptimizationMode={initialOptimizationMode}
          initialResult={initialResult}
          simulationActive={simulationActive}
          simulationData={impactData}
          onEffectiveOfficeScopeChange={setEffectiveOfficeScope}
        />
      </div>
    </div>
  );
}
