"use client";

import { useEffect, useState, useCallback } from "react";
import type { CapacityHeatmapResponse, HeatmapCell } from "@/app/api/capacity-heatmap/route";
import type { CellDetailResponse } from "@/app/api/capacity-heatmap/detail/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatWeekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function getCellStyle(
  utilization: number,
  warningThreshold: number,
  criticalThreshold: number
): { bg: string; text: string } {
  if (utilization >= criticalThreshold) {
    return { bg: "bg-red-100 hover:bg-red-200", text: "text-red-800" };
  }
  if (utilization >= warningThreshold) {
    return { bg: "bg-yellow-100 hover:bg-yellow-200", text: "text-yellow-800" };
  }
  return { bg: "bg-green-100 hover:bg-green-200", text: "text-green-800" };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type SelectedCell = {
  officeId: string;
  office: string;
  weekStart: string;
  week: number;
  utilization: number;
};

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function CellDetailModal({
  cell,
  onClose,
}: {
  cell: SelectedCell;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CellDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `/api/capacity-heatmap/detail?officeId=${encodeURIComponent(cell.officeId)}&weekStart=${encodeURIComponent(cell.weekStart)}`
    )
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<CellDetailResponse>;
      })
      .then((nextDetail) => {
        setDetail(nextDetail);
        setError(null);
      })
      .catch((err: unknown) => {
        setDetail(null);
        setError(err instanceof Error ? err.message : "Failed to load detail");
      })
      .finally(() => setLoading(false));
  }, [cell.officeId, cell.weekStart]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded border border-zinc-200 bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              {cell.office} — Week {cell.week}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {formatWeekLabel(cell.weekStart)} &middot;{" "}
              <span className="font-medium text-red-700">{cell.utilization.toFixed(1)}% utilization</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {loading && (
            <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
          )}

          {error && (
            <p className="py-4 text-center text-sm text-red-600">Error: {error}</p>
          )}

          {detail && !loading && (
            <div className="space-y-5">
              {/* Capacity summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-center">
                  <p className="text-xs text-zinc-500">Total Capacity</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">
                    {detail.totalCapacity.toFixed(0)}
                    <span className="ml-0.5 text-xs font-normal text-zinc-500">h</span>
                  </p>
                </div>
                <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-center">
                  <p className="text-xs text-zinc-500">Allocated</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">
                    {detail.totalAllocated.toFixed(0)}
                    <span className="ml-0.5 text-xs font-normal text-zinc-500">h</span>
                  </p>
                </div>
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2.5 text-center">
                  <p className="text-xs text-red-600">Remaining</p>
                  <p
                    className={`mt-0.5 text-lg font-semibold tabular-nums ${
                      detail.remainingCapacity < 0 ? "text-red-700" : "text-zinc-900"
                    }`}
                  >
                    {detail.remainingCapacity.toFixed(0)}
                    <span className="ml-0.5 text-xs font-normal text-zinc-500">h</span>
                  </p>
                </div>
              </div>

              {/* Projects contributing to overload */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Projects
                </h3>
                {detail.projects.length === 0 ? (
                  <p className="text-sm text-zinc-400">No active project assignments.</p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left">
                        <th className="pb-1.5 text-xs font-medium text-zinc-500">Project</th>
                        <th className="pb-1.5 text-xs font-medium text-zinc-500">Client</th>
                        <th className="pb-1.5 text-right text-xs font-medium text-zinc-500">
                          Hours
                        </th>
                        <th className="pb-1.5 text-right text-xs font-medium text-zinc-500">
                          Staff
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.projects.map((p) => (
                        <tr key={p.id} className="border-b border-zinc-100">
                          <td className="py-1.5 pr-3 font-medium text-zinc-900">{p.name}</td>
                          <td className="py-1.5 pr-3 text-zinc-500">{p.client}</td>
                          <td className="py-1.5 text-right tabular-nums text-zinc-700">
                            {p.allocatedHours.toFixed(1)}h
                          </td>
                          <td className="py-1.5 pl-3 text-right tabular-nums text-zinc-500">
                            {p.staffCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Staff assigned */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Staff
                </h3>
                {detail.staff.length === 0 ? (
                  <p className="text-sm text-zinc-400">No staff in this office.</p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left">
                        <th className="pb-1.5 text-xs font-medium text-zinc-500">Name</th>
                        <th className="pb-1.5 text-xs font-medium text-zinc-500">Role</th>
                        <th className="pb-1.5 text-right text-xs font-medium text-zinc-500">
                          Allocated
                        </th>
                        <th className="pb-1.5 text-right text-xs font-medium text-zinc-500">
                          Capacity
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.staff.map((s) => {
                        const over = s.allocatedHours > s.capacityHours;
                        return (
                          <tr key={s.id} className="border-b border-zinc-100">
                            <td className="py-1.5 pr-3 font-medium text-zinc-900">{s.name}</td>
                            <td className="py-1.5 pr-3 text-zinc-500">{s.jobTitle}</td>
                            <td
                              className={`py-1.5 text-right tabular-nums ${
                                over ? "font-semibold text-red-700" : "text-zinc-700"
                              }`}
                            >
                              {s.allocatedHours.toFixed(1)}h
                            </td>
                            <td className="py-1.5 pl-3 text-right tabular-nums text-zinc-500">
                              {s.capacityHours.toFixed(1)}h
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type CapacityHeatmapProps = {
  weeks?: number;
  officeIds?: string[];
  skillId?: string | null;
  data?: CapacityHeatmapResponse | null;
  onCellClick?: (cell: SelectedCell) => void;
  warningThreshold?: number;
  criticalThreshold?: number;
};

export function CapacityHeatmap({
  weeks = 12,
  officeIds,
  skillId,
  data: externalData,
  onCellClick,
  warningThreshold = 80,
  criticalThreshold = 95,
}: CapacityHeatmapProps) {
  const [internalData, setInternalData] = useState<CapacityHeatmapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const useExternalDetail = typeof onCellClick === "function";
  const data = externalData ?? internalData;

  useEffect(() => {
    if (externalData != null) {
      return;
    }
    const params = new URLSearchParams({ weeks: String(weeks) });
    if (skillId) params.set("skillId", skillId);
    fetch(`/api/capacity-heatmap?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<CapacityHeatmapResponse>;
      })
      .then((nextData) => {
        setInternalData(nextData);
        setError(null);
      })
      .catch((err: unknown) => {
        setInternalData(null);
        setError(err instanceof Error ? err.message : "Failed to load heatmap");
      });
  }, [weeks, skillId, externalData]);

  const handleCellClick = useCallback(
    (cell: HeatmapCell) => {
      const payload: SelectedCell = {
        officeId: cell.officeId,
        office: cell.office,
        weekStart: cell.weekStart,
        week: cell.week,
        utilization: cell.utilization,
      };
      if (useExternalDetail && onCellClick) {
        onCellClick(payload);
      } else {
        setSelectedCell(payload);
      }
    },
    [useExternalDetail, onCellClick]
  );

  const handleCloseModal = useCallback(() => setSelectedCell(null), []);

  const loading = externalData == null && internalData == null && error == null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-500">Loading capacity heatmap…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm text-red-700">Failed to load: {error}</p>
      </div>
    );
  }

  if (!data || data.offices.length === 0) {
    return <p className="text-sm text-zinc-500">No office data available.</p>;
  }

  // Filter by office when officeIds provided
  const filteredOffices =
    officeIds && officeIds.length > 0
      ? data.offices.filter((o) => officeIds.includes(o.id))
      : data.offices;
  const filteredCells =
    officeIds && officeIds.length > 0
      ? data.cells.filter((c) => officeIds.includes(c.officeId))
      : data.cells;

  // Build lookup: officeId → weekStart → cell
  const cellIndex = new Map<string, HeatmapCell>();
  for (const cell of filteredCells) {
    cellIndex.set(`${cell.officeId}::${cell.weekStart}`, cell);
  }

  return (
    <>
      <div className="rounded border border-zinc-200">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              {/* Sticky office column header */}
              <th className="sticky left-0 z-10 min-w-[140px] border-r border-zinc-200 bg-zinc-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Office
              </th>
              {data.weekStarts.map((ws, idx) => (
                <th
                  key={ws}
                  className="min-w-[72px] px-2 py-2.5 text-center text-xs font-medium text-zinc-500"
                >
                  <span className="block">Wk {idx + 1}</span>
                  <span className="block font-normal text-zinc-400">{formatWeekLabel(ws)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOffices.map((office, officeIdx) => (
              <tr
                key={office.id}
                className={officeIdx % 2 === 0 ? "bg-white" : "bg-zinc-50"}
              >
                {/* Sticky office name */}
                <td
                  className={`sticky left-0 z-10 border-r border-zinc-200 px-4 py-2 font-medium text-zinc-800 ${
                    officeIdx % 2 === 0 ? "bg-white" : "bg-zinc-50"
                  }`}
                >
                  {office.name}
                </td>
                {data.weekStarts.map((ws) => {
                  const cell = cellIndex.get(`${office.id}::${ws}`);
                  if (!cell) {
                    return (
                      <td key={ws} className="px-2 py-1.5 text-center">
                        <span className="block rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-400">
                          —
                        </span>
                      </td>
                    );
                  }

                  const showNoMatchingStaff = Boolean(skillId) && cell.matchingStaffCount === 0;
                  const { bg, text } = getCellStyle(
                    cell.utilization,
                    warningThreshold,
                    criticalThreshold
                  );
                  return (
                    <td key={ws} className="px-1.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleCellClick(cell)}
                        className={`block w-full rounded px-2 py-1 text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                          showNoMatchingStaff
                            ? "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                            : `${bg} ${text}`
                        }`}
                        title={
                          showNoMatchingStaff
                            ? `${office.name} — Week ${cell.week}: no staff with selected skill`
                            : `${office.name} — Week ${cell.week}: ${cell.utilization.toFixed(1)}% (click for details)`
                        }
                      >
                        {showNoMatchingStaff ? "No staff" : `${cell.utilization.toFixed(1)}%`}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 border-t border-zinc-200 bg-zinc-50 px-4 py-2.5">
          <span className="text-xs text-zinc-400">Utilization:</span>
          <span className="text-xs text-zinc-500">Committed work only</span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-3 w-3 rounded bg-green-100" />
            <span className="text-zinc-600">&lt; {warningThreshold}%</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-3 w-3 rounded bg-yellow-100" />
            <span className="text-zinc-600">{warningThreshold}–{Math.max(warningThreshold, criticalThreshold - 1)}%</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-3 w-3 rounded bg-red-100" />
            <span className="text-zinc-600">&gt;= {criticalThreshold}%</span>
          </span>
          <span className="text-xs text-zinc-400">(click cell for details)</span>
        </div>
      </div>

      {!useExternalDetail && selectedCell && (
        <CellDetailModal
          key={`${selectedCell.officeId}:${selectedCell.weekStart}`}
          cell={selectedCell}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}
