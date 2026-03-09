"use client";

import { useEffect, useMemo, useState } from "react";
import type { ForecastProposal, ForecastWeek } from "./types";
import { getDemandUtilizationPercent } from "./forecastMetrics";

// TODO: If the API ever returns best_case_utilization, expected_utilization,
// worst_case_utilization as direct percentage fields, replace the derived
// calculations below with those fields directly.

interface Props {
  weeks: ForecastWeek[];
  proposals?: ForecastProposal[];
}

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
      // Derive utilization % from demand / capacity
      // TODO: Replace with direct utilization field if API exposes it
      const pct = getDemandUtilizationPercent(getter(w), w.total_capacity);
      return `${toX(i, weeks.length).toFixed(1)},${toY(pct, maxPct).toFixed(1)}`;
    })
    .join(" ");
}

const LINES = [
  {
    key: "best_case" as const,
    label: "Committed Work Only",
    // TODO: Replace with best_case_utilization if API provides it directly
    color: "#10b981",
  },
  {
    key: "expected" as const,
    label: "Pipeline Expected",
    // TODO: Replace with expected_utilization if API provides it directly
    color: "#1d4ed8",
  },
  {
    key: "worst_case" as const,
    label: "All Pipeline Won",
    // TODO: Replace with worst_case_utilization if API provides it directly
    color: "#f59e0b",
  },
];

function formatHours(value: number): string {
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
}

function getProposalEstimateLabel(proposal: ForecastProposal): string {
  if (proposal.estimated_hours !== null && proposal.estimated_hours !== undefined) {
    return formatHours(Number(proposal.estimated_hours));
  }
  if (
    proposal.estimated_hours_per_week !== null &&
    proposal.estimated_hours_per_week !== undefined
  ) {
    return `${formatHours(Number(proposal.estimated_hours_per_week))}/wk`;
  }
  return "No estimate";
}

function getDefaultSelectedProposalIds(proposals: ForecastProposal[]): string[] {
  return proposals
    .filter((proposal) => proposal.has_complete_dates)
    .map((proposal) => proposal.id);
}

export function UtilizationForecastChart({ weeks, proposals = [] }: Props) {
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>(
    () => getDefaultSelectedProposalIds(proposals)
  );

  useEffect(() => {
    setSelectedProposalIds(getDefaultSelectedProposalIds(proposals));
  }, [proposals]);

  const selectedProposalIdSet = useMemo(
    () => new Set(selectedProposalIds),
    [selectedProposalIds]
  );

  if (weeks.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No forecast data available.</p>
    );
  }

  function getScenarioDemand(week: ForecastWeek, scenario: "best_case" | "expected" | "worst_case"): number {
    // Backward compatibility for responses without proposal-level breakdown.
    if (!week.proposal_demands || proposals.length === 0) {
      if (scenario === "best_case") return week.best_case_demand;
      if (scenario === "expected") return week.expected_demand;
      return week.worst_case_demand;
    }

    const selectedDemands = week.proposal_demands.filter((d) =>
      selectedProposalIdSet.has(d.proposal_id)
    );
    const expectedProposalDemand = selectedDemands.reduce(
      (sum, demand) => sum + Number(demand.expected_hours ?? 0),
      0
    );
    const rawProposalDemand = selectedDemands.reduce(
      (sum, demand) => sum + Number(demand.raw_hours ?? 0),
      0
    );

    if (scenario === "best_case") return week.total_project_hours;
    if (scenario === "expected") return week.total_project_hours + expectedProposalDemand;
    return week.total_project_hours + rawProposalDemand;
  }

  const lineSeries = LINES.map((line) => ({
    ...line,
    getter: (week: ForecastWeek) => getScenarioDemand(week, line.key),
  }));

  const allPcts = weeks.flatMap((w) =>
    w.total_capacity > 0
      ? lineSeries.map((l) => getDemandUtilizationPercent(l.getter(w), w.total_capacity))
      : [0]
  );
  const rawMax = Math.max(...allPcts, 100);
  const maxPct = Math.ceil(rawMax / 25) * 25;

  const yGridValues: number[] = [];
  for (let v = 0; v <= maxPct; v += 50) yGridValues.push(v);

  return (
    <div className="relative">
      {proposals.length > 0 && (
        <div className="absolute right-2 top-2 z-10 w-72 rounded-md border border-zinc-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <p className="text-[11px] font-semibold text-zinc-700">
            Proposal selection
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {selectedProposalIds.length}/{proposals.length} selected
          </p>
          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
            {proposals.map((proposal) => {
              const checked = selectedProposalIdSet.has(proposal.id);
              return (
                <label
                  key={proposal.id}
                  className="flex items-start gap-2 rounded px-1 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    checked={checked}
                    onChange={(event) => {
                      const nextChecked = event.target.checked;
                      setSelectedProposalIds((prev) => {
                        if (nextChecked) {
                          if (prev.includes(proposal.id)) return prev;
                          return [...prev, proposal.id];
                        }
                        return prev.filter((id) => id !== proposal.id);
                      });
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-zinc-700">
                      {proposal.name}
                    </span>
                    <span className="text-zinc-500">
                      {getProposalEstimateLabel(proposal)}
                      {!proposal.has_complete_dates ? " · missing dates" : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
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

        {/* Axis border lines */}
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

        {/* 100% capacity reference line */}
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

        {/* Scenario polylines */}
        {lineSeries.map((line) => (
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
        {lineSeries.map((line) =>
          weeks.map((w, i) => {
            const pct =
              getDemandUtilizationPercent(line.getter(w), w.total_capacity);
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
                <title>{`w/c ${formatWeekLabel(w.week_start)}\n${line.label}: ${pct.toFixed(1)}%`}</title>
              </circle>
            );
          })
        )}

        {/* X-axis week labels — skip every other when dense */}
        {weeks.map((w, i) => {
          if (weeks.length > 6 && i % 2 !== 0) return null;
          return (
            <text
              key={w.week_start}
              x={toX(i, weeks.length)}
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
