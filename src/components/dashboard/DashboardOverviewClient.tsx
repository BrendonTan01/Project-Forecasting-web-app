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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-metric-card h-36 animate-pulse bg-zinc-50" />
        ))}
      </div>

      {/* Two-column layout skeleton */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 min-w-0 space-y-6">
          <div className="app-panel h-72 animate-pulse bg-zinc-50" />
          <div className="app-panel h-48 animate-pulse bg-zinc-50" />
        </div>
        <div className="w-full lg:w-80 lg:shrink-0">
          <div className="app-panel h-full min-h-96 animate-pulse bg-zinc-50" />
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

  const selectedIdSet = new Set(selectedProposalIds);
  const selectedExpectedUtilization = data.weeks
    .map((week) => {
      const selectedProposalExpectedHours = (week.proposal_demands ?? [])
        .filter((demand) => selectedIdSet.has(demand.proposal_id))
        .reduce((sum, demand) => sum + Number(demand.expected_hours ?? 0), 0);
      const expectedDemand = Number(week.total_project_hours) + selectedProposalExpectedHours;
      return week.total_capacity > 0 ? (expectedDemand / Number(week.total_capacity)) * 100 : 0;
    })
    .filter((value) => Number.isFinite(value));
  const globalCapacity =
    selectedExpectedUtilization.length > 0
      ? selectedExpectedUtilization.reduce((sum, value) => sum + value, 0) /
        selectedExpectedUtilization.length
      : 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-2">
          <p className="app-section-caption">Executive snapshot</p>
          <h2 className="app-section-heading">Key operating signals</h2>
          <p className="app-page-subtitle">
            Highlights for leadership decisions on demand, utilization, and hiring over the current planning horizon.
          </p>
        </div>
      </section>
      <DashboardKpiCards
        weeks={data.weeks}
        hiringRecommendations={data.hiring_recommendations}
      />

      <section>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="app-panel min-w-0 flex-1">
            <div className="app-panel-header">
              <div className="flex flex-1 items-start justify-between gap-3">
                <div>
                  <p className="app-section-caption">Signal</p>
                  <h3 className="app-section-heading">Utilization Forecast</h3>
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <label htmlFor="forecast-horizon" className="sr-only">
                    Forecast horizon
                  </label>
                  <select
                    id="forecast-horizon"
                    value={horizonWeeks}
                    onChange={(event) => {
                      setLoading(true);
                      setError(null);
                      setHorizonWeeks(Number(event.target.value));
                    }}
                    className="app-select h-8 w-auto min-w-[8.5rem] rounded-md border-zinc-200 bg-zinc-50/70 px-2.5 py-1 text-[11px] font-medium leading-none text-zinc-600 shadow-none hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    <option value={12}>Next 12 weeks</option>
                    <option value={26}>Next 26 weeks</option>
                  </select>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Global capacity
                    </p>
                    <p className="text-3xl font-semibold leading-none text-zinc-900">
                      {globalCapacity.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="app-panel-body">
              <p className="mb-4 text-xs text-zinc-500">
                Projected team utilization over the next {horizonWeeks} weeks across three demand scenarios
              </p>
              <UtilizationForecastChart
                weeks={data.weeks}
                proposals={data.proposals}
                selectedProposalIds={selectedProposalIds}
              />
              <div className="mt-6">
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
                  showStaffingRisks={false}
                  showHiringRecommendations={false}
                  showForecastDrivers
                />
              </div>
            </div>
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
              showForecastDrivers={false}
              showExecutiveInsight
            />
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="app-panel min-w-0 flex-1">
            <div className="app-panel-header">
              <div>
                <p className="app-section-caption">Risk map</p>
                <h3 className="app-section-heading">Capacity Heatmap</h3>
              </div>
            </div>
            <div className="app-panel-body">
              <p className="mb-4 text-xs text-zinc-500">
                Office utilization by week based on committed work only — green: healthy, amber: approaching capacity, red: overloaded
              </p>
              <CapacityHeatmap weeks={horizonWeeks} />
            </div>
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
