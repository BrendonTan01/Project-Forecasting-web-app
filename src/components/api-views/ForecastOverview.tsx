"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ForecastResponse, ForecastWeek } from "@/components/dashboard/types";
import {
  deriveForecastKpis,
  getRiskAccentColor,
  getUtilizationAccentColor,
} from "@/components/dashboard/forecastMetrics";
import { UtilizationForecastChart } from "@/components/dashboard/UtilizationForecastChart";

// ── Explanation helpers ───────────────────────────────────────────────────────

type AggregatedEntry = {
  type: "proposal" | "leave" | "project";
  displayName: string;
  impact_hours: number;
};

function aggregateExplanations(weeks: ForecastWeek[]): AggregatedEntry[] {
  const map = new Map<string, AggregatedEntry>();
  for (const week of weeks) {
    for (const entry of week.forecast_explanation ?? []) {
      const displayName = entry.name;
      const key = `${entry.type}::${displayName}`;
      const existing = map.get(key);
      if (existing) {
        existing.impact_hours =
          Math.round((existing.impact_hours + entry.impact_hours) * 100) / 100;
      } else {
        map.set(key, {
          type: entry.type,
          displayName,
          impact_hours: Math.round(entry.impact_hours * 100) / 100,
        });
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => Math.abs(b.impact_hours) - Math.abs(a.impact_hours)
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const ICON_CONFIG: Record<
  "proposal" | "leave" | "project",
  { color: string; svg: React.ReactNode }
> = {
  proposal: {
    color: "#1d4ed8",
    svg: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="1" width="10" height="14" rx="1.5" />
        <line x1="5.5" y1="5" x2="10.5" y2="5" />
        <line x1="5.5" y1="8" x2="10.5" y2="8" />
        <line x1="5.5" y1="11" x2="8.5" y2="11" />
      </svg>
    ),
  },
  leave: {
    color: "#dc2626",
    svg: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="3" width="12" height="11" rx="1.5" />
        <line x1="5" y1="1.5" x2="5" y2="4.5" />
        <line x1="11" y1="1.5" x2="11" y2="4.5" />
        <line x1="2" y1="7" x2="14" y2="7" />
        <line x1="8" y1="10" x2="8" y2="10" strokeWidth={2} />
      </svg>
    ),
  },
  project: {
    color: "#10b981",
    svg: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 5.5A1.5 1.5 0 013.5 4h2.086a1.5 1.5 0 011.06.44l.915.914A1.5 1.5 0 008.62 6H12.5A1.5 1.5 0 0114 7.5V12a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12V5.5z" />
      </svg>
    ),
  },
};

// ── Forecast explanation panel ────────────────────────────────────────────────

function ForecastExplanationPanel({ weeks }: { weeks: ForecastWeek[] }) {
  const entries = aggregateExplanations(weeks);

  return (
    <div className="flex flex-col h-full">
      <h4 className="text-xs font-semibold text-zinc-700 mb-0.5">
        Forecast Drivers
      </h4>
      <p className="text-xs text-zinc-400 mb-3">
        Aggregated across all weeks
      </p>

      {entries.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No explanation data.</p>
      ) : (
        <ul className="overflow-y-auto flex-1 space-y-2 pr-1" style={{ maxHeight: 240 }}>
          {entries.map((entry, idx) => {
            const config = ICON_CONFIG[entry.type];
            const sign = entry.impact_hours >= 0 ? "+" : "−";
            const absHours = Math.abs(entry.impact_hours);
            return (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className="mt-0.5 w-4 h-4 shrink-0"
                  style={{ color: config.color }}
                >
                  {config.svg}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-zinc-700 truncate leading-tight">
                    {entry.displayName}
                  </span>
                  <span className="text-[10px] capitalize text-zinc-400">
                    {entry.type}
                  </span>
                </span>
                <span
                  className="text-xs font-semibold tabular-nums shrink-0 mt-0.5"
                  style={{ color: config.color }}
                >
                  {sign}{absHours}h
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  subtext,
  accentColor,
  href,
}: {
  label: string;
  value: string;
  subtext?: string;
  accentColor: string;
  href: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="app-card p-4 text-left transition-shadow hover:shadow-md focus-ring w-full"
    >
      <p className="text-sm text-zinc-500">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold"
        style={{ color: accentColor }}
      >
        {value}
      </p>
      {subtext && <p className="mt-1 text-xs text-zinc-400">{subtext}</p>}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ForecastOverview({ weeks = 12 }: { weeks?: number }) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/forecast?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<ForecastResponse>;
      })
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load forecast")
      )
      .finally(() => setLoading(false));
  }, [weeks]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="app-card h-24 animate-pulse bg-zinc-50" />
          ))}
        </div>
        <div className="app-card h-64 animate-pulse bg-zinc-50" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-500">
        Failed to load forecast overview: {error}
      </p>
    );
  }

  if (!data) return null;

  const { currentUtilization, expectedUtilization, staffingRisk, totalStaffNeeded } =
    deriveForecastKpis(data.weeks, data.hiring_recommendations);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Current Utilization"
          value={`${currentUtilization.toFixed(1)}%`}
          subtext="This week · confirmed projects"
          accentColor={getUtilizationAccentColor(currentUtilization)}
          href="/capacity-planner"
        />
        <MetricCard
          label="Expected Utilization"
          value={`${expectedUtilization.toFixed(1)}%`}
          subtext={`${weeks}-week avg · incl. proposals`}
          accentColor="#1d4ed8"
          href="/forecast"
        />
        <MetricCard
          label="Staffing Risk"
          value={staffingRisk}
          subtext={
            data.hiring_recommendations.length > 0
              ? `${data.hiring_recommendations.length} skill gap${data.hiring_recommendations.length !== 1 ? "s" : ""} flagged`
              : "No active shortages"
          }
          accentColor={getRiskAccentColor(staffingRisk)}
          href="/alerts"
        />
        <MetricCard
          label="Hiring Recommendations"
          value={totalStaffNeeded > 0 ? `+${totalStaffNeeded}` : "0"}
          subtext={
            totalStaffNeeded > 0
              ? `${totalStaffNeeded} staff across ${data.hiring_recommendations.length} role${data.hiring_recommendations.length !== 1 ? "s" : ""}`
              : "No hiring needed"
          }
          accentColor={totalStaffNeeded > 0 ? "#b45309" : "#047857"}
          href="/forecast"
        />
      </div>

      {/* Utilization forecast chart + explanation panel */}
      <div className="app-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-zinc-700">
          Utilization Forecast
        </h3>
        <p className="mb-4 text-xs text-zinc-500">
          Projected team utilization over the next {weeks} weeks across three demand scenarios
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-0">
            <UtilizationForecastChart weeks={data.weeks} proposals={data.proposals} />
          </div>
          <div className="w-64 shrink-0 border-l border-zinc-100 pl-4">
            <ForecastExplanationPanel weeks={data.weeks} />
          </div>
        </div>
      </div>
    </div>
  );
}
