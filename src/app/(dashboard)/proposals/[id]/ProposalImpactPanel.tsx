"use client";

export type SimulationResult = {
  proposal_id?: string;
  current_utilization?: number;
  simulated_utilization?: number;
  capacity_risk?: boolean;
  overload_week?: number | null;
  current_capacity_risk?: boolean;
  current_overload_week?: number | null;
  office_capacity_risk?: boolean;
  current_office_capacity_risk?: boolean;
  high_risk_offices?: Array<{
    office_id: string | null;
    office_name: string;
    current_peak_utilization: number;
    simulated_peak_utilization: number;
    current_overload_week: number | null;
    simulated_overload_week: number | null;
  }>;
  expected_revenue?: number | null;
  expected_cost?: number | null;
  expected_margin?: number | null;
  expected_margin_percent?: number | null;
  financially_viable?: boolean | null;
};
// Future extension point: if proposal role-demand data is modeled in simulation,
// add `required_roles` back into this contract and render it here.

type Props = {
  officeScopeLabel: string;
  simulationStale: boolean;
  onRunSimulation: () => void;
  onResetSimulation: () => void;
  simulationActive: boolean;
  simulationData: SimulationResult | null;
  loading: boolean;
  error: string | null;
};

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtWeek(week: number | null | undefined): string {
  if (week === null || week === undefined) return "None";
  return `Week ${week}`;
}

export function ProposalImpactPanel({
  officeScopeLabel,
  simulationStale,
  onRunSimulation,
  onResetSimulation,
  simulationActive,
  simulationData,
  loading,
  error,
}: Props) {
  const utilizationDelta =
    simulationData?.simulated_utilization !== undefined &&
    simulationData.current_utilization !== undefined
      ? simulationData.simulated_utilization - simulationData.current_utilization
      : null;
  const baselineRisk = simulationData?.current_capacity_risk ?? false;
  const simulatedRisk = simulationData?.capacity_risk ?? false;
  const baselineOfficeRisk = simulationData?.current_office_capacity_risk ?? false;
  const simulatedOfficeRisk = simulationData?.office_capacity_risk ?? false;
  const proposalIntroducesRisk = !baselineRisk && simulatedRisk;
  const riskUnchanged = baselineRisk === simulatedRisk;
  const officeHotspots =
    simulationData?.high_risk_offices?.slice(0, 3).map((office) => office.office_name) ?? [];
  const highRiskOfficeRows = simulationData?.high_risk_offices ?? [];

  return (
    <div className="app-card p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Acceptance summary</h2>
          <p className="text-sm text-zinc-500">
            Simulates the effect on team utilization if this proposal is accepted.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Scope: <span className="font-medium text-zinc-700">{officeScopeLabel}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onRunSimulation}
            disabled={loading}
            className={`focus-ring rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              loading
                ? "cursor-wait bg-emerald-600 text-white opacity-80"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {loading ? "Running simulation..." : "Run full simulation"}
          </button>
          <button
            type="button"
            onClick={onResetSimulation}
            disabled={!simulationActive && simulationData === null}
            className={`focus-ring rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
              simulationActive || simulationData !== null
                ? "border-zinc-300 text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50"
                : "cursor-default border-zinc-200 text-zinc-400"
            }`}
          >
            Reset Simulation
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!error && simulationStale && simulationData && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Simulation settings changed. Run <span className="font-medium">Run full simulation</span>{" "}
          again to refresh results for <span className="font-medium">{officeScopeLabel}</span>.
        </div>
      )}

      {!error && simulationData === null && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Run a simulation to view projected utilization and capacity risk.
        </div>
      )}

      {!error && simulationData && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {simulationData.current_utilization !== undefined && (
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">Current utilization</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">
                  {fmtPct(simulationData.current_utilization)}
                </p>
                <p className="text-xs text-zinc-400">Avg over forecast period</p>
              </div>
            )}

            {simulationData.simulated_utilization !== undefined && (
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">Simulated utilization</p>
                <p
                  className={`mt-1 text-2xl font-bold ${
                    simulationData.simulated_utilization > 0.9
                      ? "text-red-600"
                      : simulationData.simulated_utilization > 0.75
                        ? "text-amber-600"
                        : "text-emerald-700"
                  }`}
                >
                  {fmtPct(simulationData.simulated_utilization)}
                </p>
                {utilizationDelta !== null && (
                  <p className={`text-xs ${utilizationDelta > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {utilizationDelta > 0 ? "+" : ""}
                    {fmtPct(utilizationDelta)} vs current
                  </p>
                )}
              </div>
            )}

            {simulationData.capacity_risk !== undefined && (
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">Capacity risk</p>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${
                      simulationData.capacity_risk
                        ? "bg-red-50 text-red-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        simulationData.capacity_risk ? "bg-red-500" : "bg-emerald-500"
                      }`}
                    />
                    {simulationData.capacity_risk ? "At risk" : "Low risk"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-400">
                  {proposalIntroducesRisk
                    ? "Proposal pushes utilization above 90%"
                    : riskUnchanged && simulatedRisk
                      ? "Risk already present before this proposal"
                      : riskUnchanged
                        ? "Team stays within safe range"
                        : "Risk improves vs current baseline"}
                </p>
                {(baselineOfficeRisk || simulatedOfficeRisk) && (
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Office hotspots detected: {officeHotspots.length > 0 ? officeHotspots.join(", ") : "one or more scoped offices"}.
                  </p>
                )}
              </div>
            )}

            {simulationData.overload_week !== undefined && (
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">Overload week</p>
                <p
                  className={`mt-1 text-2xl font-bold ${
                    simulationData.overload_week !== null ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {simulationData.overload_week !== null ? `Week ${simulationData.overload_week}` : "None"}
                </p>
                <p className="text-xs text-zinc-400">
                  {simulationData.overload_week !== null
                    ? proposalIntroducesRisk
                      ? "First week above threshold after accepting"
                      : "First week above threshold in simulated baseline"
                    : "No overload projected"}
                </p>
              </div>
            )}
          </div>

          {highRiskOfficeRows.length > 0 && (
            <div className="rounded-md border border-zinc-200 p-3">
              <h3 className="text-sm font-semibold text-zinc-800">Office risk breakdown</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Offices that exceed 90% utilization at least once in the simulation window.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="app-table min-w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Office</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Current peak</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Simulated peak</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Current overload</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Simulated overload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highRiskOfficeRows.map((office) => (
                      <tr key={`${office.office_id ?? "unassigned"}:${office.office_name}`} className="border-b border-zinc-100 last:border-0">
                        <td className="px-3 py-2 text-sm text-zinc-800">{office.office_name}</td>
                        <td className="px-3 py-2 text-right text-sm text-zinc-800">
                          {fmtPct(office.current_peak_utilization)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium text-zinc-900">
                          {fmtPct(office.simulated_peak_utilization)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-zinc-700">
                          {fmtWeek(office.current_overload_week)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-zinc-700">
                          {fmtWeek(office.simulated_overload_week)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-md border border-zinc-200 p-3">
            <h3 className="text-sm font-semibold text-zinc-800">Financial Impact</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">Expected revenue</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {fmtCurrency(simulationData.expected_revenue)}
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">Expected cost</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {fmtCurrency(simulationData.expected_cost)}
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">Expected margin</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {fmtCurrency(simulationData.expected_margin)}
                </p>
                <p className="text-xs text-zinc-500">
                  {simulationData.expected_margin_percent !== null &&
                  simulationData.expected_margin_percent !== undefined
                    ? `${simulationData.expected_margin_percent.toFixed(1)}% margin`
                    : "Margin % unavailable"}
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">Financial viability</p>
                <p
                  className={`mt-1 text-lg font-semibold ${
                    simulationData.financially_viable === null ||
                    simulationData.financially_viable === undefined
                      ? "text-zinc-700"
                      : simulationData.financially_viable
                        ? "text-emerald-700"
                        : "text-red-700"
                  }`}
                >
                  {simulationData.financially_viable === null ||
                  simulationData.financially_viable === undefined
                    ? "Unknown"
                    : simulationData.financially_viable
                      ? "Worth considering"
                      : "Financial risk"}
                </p>
                <p className="text-xs text-zinc-500">
                  {simulationData.financially_viable === null ||
                  simulationData.financially_viable === undefined
                    ? "Insufficient data to evaluate."
                    : simulationData.financially_viable
                      ? "Expected margin is non-negative."
                      : "Expected margin is negative."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
