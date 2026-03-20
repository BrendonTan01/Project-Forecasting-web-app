"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CapacityHeatmap } from "@/components/api-views/CapacityHeatmap";
import CapacityPlannerFilters, {
  type CapacityPlannerFilterState,
  type OfficeOption,
} from "./CapacityPlannerFilters";
import CapacityDetailDrawer, { type SelectedCell } from "./CapacityDetailDrawer";
import type { CapacityHeatmapResponse } from "@/app/api/capacity-heatmap/route";
import type { SkillItem } from "@/app/api/skills/route";

const DEFAULT_FILTER_STATE: CapacityPlannerFilterState = {
  officeIds: [],
  skillId: null,
  weeks: 12,
};

export default function CapacityPlannerOverview() {
  const [filterState, setFilterState] =
    useState<CapacityPlannerFilterState>(DEFAULT_FILTER_STATE);
  const [heatmapData, setHeatmapData] =
    useState<CapacityHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [warningThreshold, setWarningThreshold] = useState(80);
  const [criticalThreshold, setCriticalThreshold] = useState(95);
  const [optimalMin, setOptimalMin] = useState(80);
  const [optimalMax, setOptimalMax] = useState(90);

  useEffect(() => {
    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : { skills: [] }))
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
  }, []);

  const fetchHeatmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ weeks: String(filterState.weeks) });
    if (filterState.skillId) params.set("skillId", filterState.skillId);
    try {
      const res = await fetch(`/api/capacity-heatmap?${params.toString()}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as CapacityHeatmapResponse;
      setHeatmapData(data);
    } catch (err) {
      setHeatmapData(null);
      setError(err instanceof Error ? err.message : "Failed to load heatmap");
    } finally {
      setLoading(false);
    }
  }, [filterState.weeks, filterState.skillId]);

  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap]);

  const offices: OfficeOption[] = heatmapData?.offices ?? [];
  const selectedSkillName =
    filterState.skillId
      ? skills.find((skill) => skill.id === filterState.skillId)?.name ?? "Unknown skill"
      : null;
  const visibleCells = useMemo(() => {
    if (!heatmapData) return [];
    if (filterState.officeIds.length === 0) return heatmapData.cells;
    const include = new Set(filterState.officeIds);
    return heatmapData.cells.filter((cell) => include.has(cell.officeId));
  }, [heatmapData, filterState.officeIds]);

  const utilizationMetrics = useMemo(() => {
    const totals = visibleCells.reduce(
      (acc, cell) => {
        acc.capacity += cell.totalCapacityHours;
        acc.allocated += cell.allocatedHours;
        acc.unassigned += cell.positiveRemainingHours;
        return acc;
      },
      { capacity: 0, allocated: 0, unassigned: 0 }
    );
    const averageUtilization =
      totals.capacity > 0 ? (totals.allocated / totals.capacity) * 100 : 0;
    const peakOverbookedStaff = visibleCells.reduce(
      (peak, cell) => Math.max(peak, cell.overbookedStaffCount),
      0
    );
    return {
      averageUtilization,
      peakOverbookedStaff,
      unassignedPotential: totals.unassigned,
    };
  }, [visibleCells]);

  const officeDistribution = useMemo(() => {
    if (!heatmapData) return [];
    const include =
      filterState.officeIds.length > 0 ? new Set(filterState.officeIds) : null;
    const summary = new Map<
      string,
      {
        officeName: string;
        capacity: number;
        allocated: number;
      }
    >();
    for (const cell of heatmapData.cells) {
      if (include && !include.has(cell.officeId)) continue;
      const current = summary.get(cell.officeId) ?? {
        officeName: cell.office,
        capacity: 0,
        allocated: 0,
      };
      current.capacity += cell.totalCapacityHours;
      current.allocated += cell.allocatedHours;
      summary.set(cell.officeId, current);
    }
    return Array.from(summary.entries()).map(([officeId, value]) => {
      const utilization = value.capacity > 0 ? (value.allocated / value.capacity) * 100 : 0;
      return {
        officeId,
        officeName: value.officeName,
        utilization,
      };
    });
  }, [heatmapData, filterState.officeIds]);

  const exportPlan = useCallback(() => {
    if (!heatmapData) return;
    const include =
      filterState.officeIds.length > 0 ? new Set(filterState.officeIds) : null;
    const rows = heatmapData.cells
      .filter((cell) => (include ? include.has(cell.officeId) : true))
      .map((cell) => [
        cell.office,
        cell.weekStart,
        cell.utilization.toFixed(2),
        cell.totalCapacityHours.toFixed(2),
        cell.allocatedHours.toFixed(2),
        cell.remainingHours.toFixed(2),
        String(cell.overbookedStaffCount),
      ]);
    const csv = [
      [
        "office",
        "week_start",
        "utilization_percent",
        "total_capacity_hours",
        "allocated_hours",
        "remaining_hours",
        "overbooked_staff_count",
      ].join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "capacity-plan.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [heatmapData, filterState.officeIds]);

  const utilizationDelta = utilizationMetrics.averageUtilization - optimalMax;
  const utilizationTone =
    utilizationMetrics.averageUtilization >= criticalThreshold
      ? "text-red-700"
      : utilizationMetrics.averageUtilization >= warningThreshold
      ? "text-amber-700"
      : "text-emerald-700";

  return (
    <div className="space-y-4">
      <CapacityPlannerFilters
        offices={offices}
        state={filterState}
        onChange={setFilterState}
        onExportPlan={exportPlan}
      />

      <main className="min-w-0">
        {selectedSkillName && (
          <div className="mb-3 rounded-lg border border-[color:color-mix(in_srgb,var(--border)_24%,transparent)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm text-zinc-700">
            Filtered by skill:{" "}
            <span className="font-medium text-zinc-900">{selectedSkillName}</span>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-[color:var(--muted-text)]">Loading capacity heatmap…</p>
          </div>
        )}
        {error && (
          <div className="app-alert app-alert-error">
            <p className="text-sm">Failed to load: {error}</p>
          </div>
        )}
        {heatmapData && !loading && (
          <div className="space-y-4 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_20%,transparent)] bg-[color:var(--surface-lowest)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="app-btn app-btn-secondary px-3 py-1.5 text-xs"
                onClick={() => setShowThresholdConfig((prev) => !prev)}
              >
                Configure thresholds
              </button>
            </div>
            {showThresholdConfig && (
              <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-zinc-600">
                  Warning (%)
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={warningThreshold}
                    onChange={(e) => setWarningThreshold(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800"
                  />
                </label>
                <label className="text-xs text-zinc-600">
                  Critical (%)
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={criticalThreshold}
                    onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800"
                  />
                </label>
                <label className="text-xs text-zinc-600">
                  Optimal min (%)
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={optimalMin}
                    onChange={(e) => setOptimalMin(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800"
                  />
                </label>
                <label className="text-xs text-zinc-600">
                  Optimal max (%)
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={optimalMax}
                    onChange={(e) => setOptimalMax(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800"
                  />
                </label>
              </div>
            )}
            <CapacityHeatmap
              weeks={filterState.weeks}
              officeIds={
                filterState.officeIds.length > 0
                  ? filterState.officeIds
                  : undefined
              }
              skillId={filterState.skillId}
              data={heatmapData}
              onCellClick={setSelectedCell}
              warningThreshold={warningThreshold}
              criticalThreshold={criticalThreshold}
            />

            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Total capacity utilization</p>
                <p className={`mt-2 text-4xl font-semibold tracking-tight ${utilizationTone}`}>
                  {utilizationMetrics.averageUtilization.toFixed(1)}%
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Optimal range: {optimalMin}% - {optimalMax}%
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {utilizationDelta > 0 ? `+${utilizationDelta.toFixed(1)}% over target` : `${Math.abs(utilizationDelta).toFixed(1)}% below target`}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Critical overloads</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-red-700">
                  {utilizationMetrics.peakOverbookedStaff.toString().padStart(2, "0")}
                </p>
                <p className="mt-2 text-xs text-zinc-500">Peak overbooked staff in a single week</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Unassigned potential</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
                  {Math.round(utilizationMetrics.unassignedPotential).toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-zinc-500">Hours of positive remaining capacity</p>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">Office capacity distribution</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {officeDistribution.map((office) => {
                  const toneClass =
                    office.utilization >= criticalThreshold
                      ? "bg-red-600"
                      : office.utilization >= warningThreshold
                      ? "bg-amber-500"
                      : "bg-emerald-500";
                  const subtitle =
                    office.utilization >= criticalThreshold
                      ? "High overload risk"
                      : office.utilization >= warningThreshold
                      ? "Near full utilization"
                      : "Capacity available";
                  return (
                    <article key={office.officeId} className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-900">{office.officeName}</p>
                        <span className="text-xs font-semibold text-zinc-600">{office.utilization.toFixed(0)}% load</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full ${toneClass}`}
                          style={{ width: `${Math.max(0, Math.min(100, office.utilization))}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">{subtitle}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </main>

      {selectedCell && (
        <CapacityDetailDrawer
          cell={selectedCell}
          skillId={filterState.skillId}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  );
}
