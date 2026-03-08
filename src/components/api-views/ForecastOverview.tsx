"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExplanationEntry =
  | { type: "proposal"; name: string; impact_hours: number }
  | { type: "leave"; staff: string; impact_hours: number }
  | { type: "project"; name: string; impact_hours: number };

interface ForecastWeek {
  week_start: string;
  total_capacity: number;
  total_project_hours: number;
  utilization_rate: number;
  staffing_gap: number;
  best_case_demand: number;
  expected_demand: number;
  worst_case_demand: number;
  forecast_explanation?: ExplanationEntry[];
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
      const displayName =
        entry.type === "leave" ? entry.staff : entry.name;
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
            <UtilizationChart weeks={data.weeks} />
          </div>
          <div className="w-64 shrink-0 border-l border-zinc-100 pl-4">
            <ForecastExplanationPanel weeks={data.weeks} />
          </div>
        </div>
      </div>
    </div>
  );
}
