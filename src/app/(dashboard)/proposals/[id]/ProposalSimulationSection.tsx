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

export function ProposalSimulationSection({
  proposalId,
  allOffices,
  initialOfficeScope,
  initialOptimizationMode,
  initialResult,
}: Props) {
  const [simulationActive, setSimulationActive] = useState(false);
  const [impactData, setImpactData] = useState<SimulationResult | null>(null);

  function handleSimulateAccept(data: SimulationResult) {
    setImpactData(data);
    setSimulationActive(true);
  }

  function handleSimulateReject() {
    setSimulationActive(false);
    setImpactData(null);
  }

  return (
    <div className="space-y-4">
      <ProposalImpactPanel
        proposalId={proposalId}
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
        />
      </div>
    </div>
  );
}
