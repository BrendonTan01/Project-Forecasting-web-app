"use client";

import { useEffect, useState } from "react";
import { DashboardKpiCards } from "./DashboardKpiCards";
import { UtilizationForecastChart } from "./UtilizationForecastChart";
import { DashboardActionPanel } from "./DashboardActionPanel";
import { CapacityHeatmap } from "@/components/api-views/CapacityHeatmap";
import type { ForecastResponse } from "./types";

interface Props {
  weeks?: number;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-card h-24 animate-pulse bg-zinc-50" />
        ))}
      </div>

      {/* Two-column layout skeleton */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-6">
          <div className="app-card h-72 animate-pulse bg-zinc-50" />
          <div className="app-card h-48 animate-pulse bg-zinc-50" />
        </div>
        <div className="w-80 shrink-0">
          <div className="app-card h-full min-h-96 animate-pulse bg-zinc-50" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardOverviewClient({ weeks = 26 }: Props) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [horizonWeeks, setHorizonWeeks] = useState<number>(weeks);

  useEffect(() => {
    fetch(`/api/forecast?weeks=${horizonWeeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<ForecastResponse>;
      })
      .then((nextData) => {
        setData(nextData);
        const defaults = nextData.proposals
          .filter((proposal) => proposal.has_complete_dates)
          .map((proposal) => proposal.id);
        setSelectedProposalIds(defaults);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load forecast")
      )
      .finally(() => setLoading(false));
  }, [horizonWeeks]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-medium text-red-700">Failed to load forecast data</p>
        <p className="mt-0.5 text-xs text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <DashboardKpiCards
        weeks={data.weeks}
        hiringRecommendations={data.hiring_recommendations}
      />

      <div className="flex items-center justify-end gap-2">
        <label htmlFor="forecast-horizon" className="text-xs font-medium text-zinc-600">
          Horizon
        </label>
        <select
          id="forecast-horizon"
          value={horizonWeeks}
          onChange={(event) => {
            setLoading(true);
            setError(null);
            setHorizonWeeks(Number(event.target.value));
          }}
          className="app-select w-auto px-2 py-1 text-xs text-zinc-800"
        >
          <option value={12}>12 weeks</option>
          <option value={26}>26 weeks</option>
        </select>
      </div>

      <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-blue-900">Forecasting Components</h2>
          <p className="text-xs text-blue-800/80">
            Scenario planning signals for upcoming demand and pipeline impact.
          </p>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="app-card min-w-0 flex-1 p-4">
            <h3 className="mb-1 text-sm font-semibold text-zinc-700">
              Utilization Forecast
            </h3>
            <p className="mb-4 text-xs text-zinc-500">
              Projected team utilization over the next {horizonWeeks} weeks across three demand scenarios
            </p>
            <UtilizationForecastChart
              weeks={data.weeks}
              proposals={data.proposals}
              selectedProposalIds={selectedProposalIds}
            />
          </div>

          <div className="w-full lg:w-80 lg:shrink-0 lg:self-stretch">
            <DashboardActionPanel
              weeks={data.weeks}
              hiringRecommendations={data.hiring_recommendations}
              proposals={data.proposals}
              selectedProposalIds={selectedProposalIds}
              onSelectedProposalIdsChange={setSelectedProposalIds}
              planningHoursPerPersonPerWeek={Number(
                data.planning_hours_per_person_per_week ?? 40
              )}
              showProposalSelection
              showStaffingRisks={false}
              showHiringRecommendations={false}
              showForecastDrivers
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-emerald-900">Current Components</h2>
          <p className="text-xs text-emerald-800/80">
            Current-state operational signals based on committed work and present capacity.
          </p>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="app-card min-w-0 flex-1 p-4">
            <h3 className="mb-1 text-sm font-semibold text-zinc-700">
              Capacity Heatmap
            </h3>
            <p className="mb-4 text-xs text-zinc-500">
              Office utilization by week based on committed work only — green: healthy, amber: approaching capacity, red: overloaded
            </p>
            <CapacityHeatmap weeks={horizonWeeks} />
          </div>

          <div className="w-full lg:w-80 lg:shrink-0 lg:self-stretch">
            <DashboardActionPanel
              weeks={data.weeks}
              hiringRecommendations={data.hiring_recommendations}
              proposals={data.proposals}
              selectedProposalIds={selectedProposalIds}
              onSelectedProposalIdsChange={setSelectedProposalIds}
              planningHoursPerPersonPerWeek={Number(
                data.planning_hours_per_person_per_week ?? 40
              )}
              showProposalSelection={false}
              showStaffingRisks
              showHiringRecommendations
              showForecastDrivers={false}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
