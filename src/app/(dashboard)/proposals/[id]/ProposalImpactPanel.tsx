"use client";

import { useEffect, useState } from "react";

export type SimulationResult = {
  proposal_id: string;
  current_utilization: number;
  simulated_utilization: number;
  capacity_risk: boolean;
  overload_week: number | null;
};

type Props = {
  proposalId: string;
  onSimulateAccept: (data: SimulationResult) => void;
  onSimulateReject: () => void;
  simulationActive: boolean;
};

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function ProposalImpactPanel({
  proposalId,
  onSimulateAccept,
  onSimulateReject,
  simulationActive,
}: Props) {
  const [data, setData] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/proposal-impact?proposalId=${encodeURIComponent(proposalId)}`)
      .then((res) => {
        if (!res.ok) return res.json().then((e) => Promise.reject(e?.error ?? "Request failed"));
        return res.json();
      })
      .then((json: SimulationResult) => {
        if (!cancelled) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(typeof err === "string" ? err : "Failed to load impact data");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  const utilizationDelta =
    data !== null ? data.simulated_utilization - data.current_utilization : null;

  return (
    <div className="app-card p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Proposal impact</h2>
          <p className="text-sm text-zinc-500">
            Simulates the effect on team utilization if this proposal is accepted.
          </p>
        </div>
        {data && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => onSimulateAccept(data)}
              disabled={simulationActive}
              className={`focus-ring rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                simulationActive
                  ? "cursor-default bg-emerald-600 text-white opacity-80"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {simulationActive ? "Accepted" : "Simulate Accept"}
            </button>
            <button
              type="button"
              onClick={onSimulateReject}
              disabled={!simulationActive}
              className={`focus-ring rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                simulationActive
                  ? "border-zinc-300 text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50"
                  : "cursor-default border-zinc-200 text-zinc-400"
              }`}
            >
              Simulate Reject
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6 text-sm text-zinc-500">
          Loading impact data…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Current utilization */}
          <div className="rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-500">Current utilization</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">
              {fmtPct(data.current_utilization)}
            </p>
            <p className="text-xs text-zinc-400">Avg over forecast period</p>
          </div>

          {/* Simulated utilization */}
          <div className="rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-500">Simulated utilization</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                data.simulated_utilization > 0.9 ? "text-red-600" : data.simulated_utilization > 0.75 ? "text-amber-600" : "text-emerald-700"
              }`}
            >
              {fmtPct(data.simulated_utilization)}
            </p>
            {utilizationDelta !== null && (
              <p className={`text-xs ${utilizationDelta > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {utilizationDelta > 0 ? "+" : ""}
                {fmtPct(utilizationDelta)} vs current
              </p>
            )}
          </div>

          {/* Capacity risk */}
          <div className="rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-500">Capacity risk</p>
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${
                  data.capacity_risk
                    ? "bg-red-50 text-red-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    data.capacity_risk ? "bg-red-500" : "bg-emerald-500"
                  }`}
                />
                {data.capacity_risk ? "At risk" : "Low risk"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">
              {data.capacity_risk
                ? "Team exceeds 90% utilization"
                : "Team stays within safe range"}
            </p>
          </div>

          {/* Overload week */}
          <div className="rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-500">Overload week</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                data.overload_week !== null ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {data.overload_week !== null ? `Week ${data.overload_week}` : "None"}
            </p>
            <p className="text-xs text-zinc-400">
              {data.overload_week !== null
                ? "First week above capacity threshold"
                : "No overload projected"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
