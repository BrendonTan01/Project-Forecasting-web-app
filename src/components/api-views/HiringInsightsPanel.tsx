"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import type { ForecastResponse, HiringRecommendation } from "@/components/dashboard/types";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

export function HiringInsightsPanel({ weeks = 12 }: { weeks?: number }) {
  const [recommendations, setRecommendations] = useState<HiringRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HiringRecommendation | null>(null);

  useEffect(() => {
    fetch(`/api/forecast?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<ForecastResponse>;
      })
      .then((json) => {
        setRecommendations(json.hiring_recommendations ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [weeks]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading hiring insights...</p>;
  }
  if (error) {
    return <p className="text-sm text-red-500">Failed to load: {error}</p>;
  }
  if (!recommendations.length) {
    return (
      <div className="app-empty-state p-6 text-center">
        <p className="text-sm font-medium text-zinc-700">No hiring recommendations</p>
        <p className="mt-1 text-xs text-zinc-500">
          All skills are within capacity for the next {weeks} weeks.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Card grid */}
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map((rec) => {
            const isSelected = selected?.skill === rec.skill;
            const badgeVariant = rec.staff_needed >= 2 ? "danger" : "warning";

            return (
              <button
                key={rec.skill}
                type="button"
                onClick={() => setSelected(isSelected ? null : rec)}
                className={[
                  "app-card w-full cursor-pointer p-4 text-left transition-all",
                  isSelected
                    ? "ring-2 ring-blue-500"
                    : "hover:shadow-md",
                ].join(" ")}
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900">{rec.skill}</h3>
                  <Badge variant={badgeVariant} className="shrink-0 whitespace-nowrap">
                    {rec.staff_needed} {rec.staff_needed === 1 ? "hire" : "hires"} needed
                  </Badge>
                </div>

                {/* Key metrics */}
                <dl className="mb-3 space-y-1.5">
                  {rec.shortage_start_week && (
                    <div className="flex items-center justify-between text-xs">
                      <dt className="text-zinc-500">Shortage starts</dt>
                      <dd className="font-medium text-zinc-800 tabular-nums">
                        {formatDate(rec.shortage_start_week)}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <dt className="text-zinc-500">Hire within</dt>
                    <dd className="font-medium text-zinc-800 tabular-nums">
                      {rec.recommended_hiring_window_weeks}{" "}
                      {rec.recommended_hiring_window_weeks === 1 ? "week" : "weeks"}
                    </dd>
                  </div>
                </dl>

                {/* Projects causing shortage */}
                {rec.demand_sources && rec.demand_sources.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-zinc-500">
                      Projects causing shortage
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {rec.demand_sources.slice(0, 3).map((src) => (
                        <span
                          key={src.project_name}
                          className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700"
                        >
                          {src.project_name}
                        </span>
                      ))}
                      {rec.demand_sources.length > 3 && (
                        <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                          +{rec.demand_sources.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-blue-600">
                  {isSelected ? "Click to close" : "Click for details"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="app-card w-72 shrink-0 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">{selected.skill}</h3>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Close detail panel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          <p className="mb-3 text-xs text-zinc-500">Demand sources driving the shortage</p>

          {selected.demand_sources && selected.demand_sources.length > 0 ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-zinc-50">
                  <th className="py-1.5 pr-3 text-left font-medium text-zinc-600">Project</th>
                  <th className="py-1.5 text-right font-medium text-zinc-600">hrs / wk</th>
                </tr>
              </thead>
              <tbody>
                {selected.demand_sources.map((src) => (
                  <tr key={src.project_name} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-3 text-zinc-800">{src.project_name}</td>
                    <td className="py-1.5 text-right tabular-nums text-zinc-700">
                      {src.hours_per_week % 1 === 0
                        ? src.hours_per_week
                        : src.hours_per_week.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-2 text-xs font-medium text-zinc-500">Total demand</td>
                  <td className="pt-2 text-right tabular-nums text-xs font-semibold text-zinc-800">
                    {(() => {
                      const total = selected.demand_sources.reduce(
                        (sum, s) => sum + s.hours_per_week,
                        0
                      );
                      return total % 1 === 0 ? total : total.toFixed(1);
                    })()}
                    {" "}hrs / wk
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="text-xs text-zinc-500">No demand source data available.</p>
          )}

          <div className="mt-4 space-y-1.5 border-t border-zinc-100 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Staff needed</span>
              <span className="font-semibold text-zinc-900">
                {selected.staff_needed}
              </span>
            </div>
            {selected.shortage_start_week && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Shortage starts</span>
                <span className="font-medium text-zinc-800 tabular-nums">
                  {formatDate(selected.shortage_start_week)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Hire within</span>
              <span className="font-medium text-zinc-800">
                {selected.recommended_hiring_window_weeks}{" "}
                {selected.recommended_hiring_window_weeks === 1 ? "week" : "weeks"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
