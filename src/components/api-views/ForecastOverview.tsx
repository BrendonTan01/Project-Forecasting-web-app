"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ForecastWeek {
  week_start: string;
  total_capacity: number;
  total_project_hours: number;
  utilization_rate: number;
  staffing_gap: number;
  best_case_demand: number;
  expected_demand: number;
  worst_case_demand: number;
}

interface HiringRecommendation {
  skill: string;
  staff_needed: number;
  recommended_hiring_window_weeks: number;
}

interface ForecastResponse {
  weeks: ForecastWeek[];
  hiring_recommendations: HiringRecommendation[];
}

// ── Derived metrics ───────────────────────────────────────────────────────────

function deriveMetrics(data: ForecastResponse) {
  const { weeks, hiring_recommendations } = data;

  const currentUtilization =
    weeks.length > 0 ? weeks[0].utilization_rate * 100 : 0;

  const validWeeks = weeks.filter((w) => w.total_capacity > 0);
  const expectedUtilization =
    validWeeks.length > 0
      ? validWeeks.reduce(
          (sum, w) => sum + (w.expected_demand / w.total_capacity) * 100,
          0
        ) / validWeeks.length
      : 0;

  const totalStaffNeeded = hiring_recommendations.reduce(
    (sum, r) => sum + r.staff_needed,
    0
  );

  const riskLevel =
    hiring_recommendations.length > 2
      ? "High"
      : hiring_recommendations.length > 0
        ? "Medium"
        : "None";

  return { currentUtilization, expectedUtilization, riskLevel, totalStaffNeeded };
}

// ── SVG line chart ────────────────────────────────────────────────────────────

const CHART = {
  viewW: 840,
  viewH: 260,
  padLeft: 52,
  padRight: 16,
  padTop: 12,
  padBottom: 40,
} as const;

const chartW = CHART.viewW - CHART.padLeft - CHART.padRight;
const chartH = CHART.viewH - CHART.padTop - CHART.padBottom;

function formatWeekLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function toX(i: number, total: number): number {
  if (total <= 1) return CHART.padLeft + chartW / 2;
  return CHART.padLeft + (i / (total - 1)) * chartW;
}

function toY(pct: number, maxPct: number): number {
  const clamped = Math.max(0, Math.min(pct, maxPct));
  return CHART.padTop + chartH - (clamped / maxPct) * chartH;
}

function buildPoints(
  weeks: ForecastWeek[],
  getter: (w: ForecastWeek) => number,
  maxPct: number
): string {
  return weeks
    .map((w, i) => {
      const pct = w.total_capacity > 0 ? (getter(w) / w.total_capacity) * 100 : 0;
      return `${toX(i, weeks.length).toFixed(1)},${toY(pct, maxPct).toFixed(1)}`;
    })
    .join(" ");
}

const LINES = [
  {
    key: "best_case" as const,
    label: "Best Case",
    color: "#10b981",
    getter: (w: ForecastWeek) => w.best_case_demand,
  },
  {
    key: "expected" as const,
    label: "Expected",
    color: "#1d4ed8",
    getter: (w: ForecastWeek) => w.expected_demand,
  },
  {
    key: "worst_case" as const,
    label: "Worst Case",
    color: "#f59e0b",
    getter: (w: ForecastWeek) => w.worst_case_demand,
  },
];

function UtilizationChart({ weeks }: { weeks: ForecastWeek[] }) {
  if (weeks.length === 0) {
    return <p className="text-sm text-zinc-500">No forecast data available.</p>;
  }

  const allPcts = weeks.flatMap((w) =>
    w.total_capacity > 0
      ? LINES.map((l) => (l.getter(w) / w.total_capacity) * 100)
      : [0]
  );
  const rawMax = Math.max(...allPcts, 100);
  const maxPct = Math.ceil(rawMax / 25) * 25;

  const yGridValues = [];
  for (let v = 0; v <= maxPct; v += 50) yGridValues.push(v);

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART.viewW} ${CHART.viewH}`}
        width="100%"
        aria-label="Utilization forecast chart"
        role="img"
      >
        {/* Y-axis grid lines */}
        {yGridValues.map((v) => {
          const y = toY(v, maxPct);
          return (
            <g key={v}>
              <line
                x1={CHART.padLeft}
                y1={y}
                x2={CHART.padLeft + chartW}
                y2={y}
                stroke="#e4e7ed"
                strokeWidth={1}
              />
              <text
                x={CHART.padLeft - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="#6b7280"
              >
                {v}%
              </text>
            </g>
          );
        })}

        {/* Chart border lines */}
        <line
          x1={CHART.padLeft}
          y1={CHART.padTop}
          x2={CHART.padLeft}
          y2={CHART.padTop + chartH}
          stroke="#d1d5db"
          strokeWidth={1}
        />
        <line
          x1={CHART.padLeft}
          y1={CHART.padTop + chartH}
          x2={CHART.padLeft + chartW}
          y2={CHART.padTop + chartH}
          stroke="#d1d5db"
          strokeWidth={1}
        />

        {/* 100% reference line */}
        {maxPct > 100 && (
          <line
            x1={CHART.padLeft}
            y1={toY(100, maxPct)}
            x2={CHART.padLeft + chartW}
            y2={toY(100, maxPct)}
            stroke="#dc2626"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.5}
          />
        )}

        {/* Scenario lines */}
        {LINES.map((line) => (
          <polyline
            key={line.key}
            points={buildPoints(weeks, line.getter, maxPct)}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Data point circles with native tooltips */}
        {LINES.map((line) =>
          weeks.map((w, i) => {
            const pct =
              w.total_capacity > 0
                ? (line.getter(w) / w.total_capacity) * 100
                : 0;
            const cx = toX(i, weeks.length);
            const cy = toY(pct, maxPct);
            return (
              <circle
                key={`${line.key}-${w.week_start}`}
                cx={cx}
                cy={cy}
                r={3}
                fill={line.color}
                stroke="white"
                strokeWidth={1.5}
              >
                <title>
                  {`w/c ${formatWeekLabel(w.week_start)}\n${line.label}: ${pct.toFixed(1)}%`}
                </title>
              </circle>
            );
          })
        )}

        {/* X-axis week labels — every other week to avoid crowding */}
        {weeks.map((w, i) => {
          if (weeks.length > 6 && i % 2 !== 0) return null;
          const x = toX(i, weeks.length);
          return (
            <text
              key={w.week_start}
              x={x}
              y={CHART.padTop + chartH + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#6b7280"
            >
              {formatWeekLabel(w.week_start)}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600">
        {LINES.map((line) => (
          <span key={line.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{ backgroundColor: line.color }}
            />
            {line.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-5 border-t border-dashed"
            style={{ borderColor: "#dc2626", opacity: 0.5 }}
          />
          100% capacity
        </span>
      </div>
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

  const { currentUtilization, expectedUtilization, riskLevel, totalStaffNeeded } =
    deriveMetrics(data);

  const currentUtilColor =
    currentUtilization > 110
      ? "#b45309"
      : currentUtilization < 60
        ? "#6b7280"
        : "#047857";

  const riskColor =
    riskLevel === "High"
      ? "#b91c1c"
      : riskLevel === "Medium"
        ? "#b45309"
        : "#047857";

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Current Utilization"
          value={`${currentUtilization.toFixed(1)}%`}
          subtext="This week · confirmed projects"
          accentColor={currentUtilColor}
          href="/capacity"
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
          value={riskLevel}
          subtext={
            data.hiring_recommendations.length > 0
              ? `${data.hiring_recommendations.length} skill gap${data.hiring_recommendations.length !== 1 ? "s" : ""} flagged`
              : "No active shortages"
          }
          accentColor={riskColor}
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

      {/* Utilization forecast chart */}
      <div className="app-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-zinc-700">
          Utilization Forecast
        </h3>
        <p className="mb-4 text-xs text-zinc-500">
          Projected team utilization over the next {weeks} weeks across three demand scenarios
        </p>
        <UtilizationChart weeks={data.weeks} />
      </div>
    </div>
  );
}
