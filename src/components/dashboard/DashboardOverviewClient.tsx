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

export default function DashboardOverviewClient({ weeks = 12 }: Props) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/forecast?weeks=${weeks}`)
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
  }, [weeks]);

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

      {/* Row 2+: Chart + Heatmap (left) alongside Action Panel (right) */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left column: forecast chart + capacity heatmap stacked */}
        <div className="flex-1 min-w-0 space-y-6">
          <div className="app-card p-4">
            <h2 className="mb-1 text-sm font-semibold text-zinc-700">
              Utilization Forecast
            </h2>
            <p className="mb-4 text-xs text-zinc-500">
              Projected team utilization over the next {weeks} weeks across three demand scenarios
            </p>
            <UtilizationForecastChart
              weeks={data.weeks}
              proposals={data.proposals}
              selectedProposalIds={selectedProposalIds}
            />
          </div>

          <div className="app-card p-4">
            <h2 className="mb-1 text-sm font-semibold text-zinc-700">
              Capacity Heatmap
            </h2>
            <p className="mb-4 text-xs text-zinc-500">
              Office utilization by week — green: healthy, amber: approaching capacity, red: overloaded
            </p>
            <CapacityHeatmap weeks={weeks} />
          </div>
        </div>

        {/* Right column: action panel */}
        <div className="w-full lg:w-80 lg:shrink-0">
          <DashboardActionPanel
            weeks={data.weeks}
            hiringRecommendations={data.hiring_recommendations}
            skillShortages={data.skill_shortages}
            proposals={data.proposals}
            selectedProposalIds={selectedProposalIds}
            onSelectedProposalIdsChange={setSelectedProposalIds}
          />
        </div>
      </div>
    </div>
  );
}
