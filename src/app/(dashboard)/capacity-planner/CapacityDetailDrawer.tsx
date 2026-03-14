"use client";

import { useEffect, useState } from "react";
import type { CellDetailResponse } from "@/app/api/capacity-heatmap/detail/route";

export type SelectedCell = {
  officeId: string;
  office: string;
  weekStart: string;
  week: number;
  utilization: number;
};

function formatWeekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function utilizationColor(utilization: number): string {
  if (utilization > 95) return "text-red-700";
  if (utilization >= 80) return "text-amber-700";
  return "text-green-700";
}

interface CapacityDetailDrawerProps {
  cell: SelectedCell;
  skillId?: string | null;
  onClose: () => void;
}

export default function CapacityDetailDrawer({
  cell,
  skillId,
  onClose,
}: CapacityDetailDrawerProps) {
  const [detail, setDetail] = useState<CellDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      officeId: cell.officeId,
      weekStart: cell.weekStart,
    });
    if (skillId) {
      params.set("skillId", skillId);
    }
    fetch(
      `/api/capacity-heatmap/detail?${params.toString()}`
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
  }, [cell.officeId, cell.weekStart, skillId]);

  return (
    <aside className="w-80 shrink-0 overflow-y-auto rounded border border-zinc-200 bg-white">
      <div className="sticky top-0 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{cell.office}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {formatWeekLabel(cell.weekStart)} &middot; Week {cell.week}
            </p>
            <p className={`mt-0.5 text-sm font-medium ${utilizationColor(cell.utilization)}`}>
              {cell.utilization.toFixed(1)}% utilization
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus-ring"
            aria-label="Close panel"
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
      </div>

      <div className="p-4">
        {loading && (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        )}

        {error && (
          <p className="py-4 text-center text-sm text-red-600">Error: {error}</p>
        )}

        {detail && !loading && (
          <div className="space-y-4">
            {/* Capacity summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-center">
                <p className="text-xs text-zinc-500">Total Capacity</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-900">
                  {detail.totalCapacity.toFixed(0)}
                  <span className="ml-0.5 text-xs font-normal text-zinc-500">h</span>
                </p>
              </div>
              <div className="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-center">
                <p className="text-xs text-zinc-500">Allocated</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-900">
                  {detail.totalAllocated.toFixed(0)}
                  <span className="ml-0.5 text-xs font-normal text-zinc-500">h</span>
                </p>
              </div>
              <div className="col-span-2 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-center">
                <p className="text-xs text-zinc-500">Remaining capacity</p>
                <p
                  className={`mt-0.5 text-base font-semibold tabular-nums ${
                    detail.remainingCapacity < 0 ? "text-red-700" : "text-zinc-900"
                  }`}
                >
                  {detail.remainingCapacity.toFixed(0)}
                  <span className="ml-0.5 text-xs font-normal text-zinc-500">h</span>
                </p>
              </div>
            </div>

            {/* Leave impact */}
            {detail.leaveImpactHours !== undefined && detail.leaveImpactHours > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-medium text-amber-800">Leave impact</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-900">
                  -{detail.leaveImpactHours.toFixed(1)}h
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Approved leave reduces available capacity this week
                </p>
              </div>
            )}

            {/* Projects */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Projects
              </h3>
              {detail.projects.length === 0 ? (
                <p className="text-sm text-zinc-400">No active project assignments.</p>
              ) : (
                <div className="space-y-2">
                  {detail.projects.map((p) => (
                    <div
                      key={p.id}
                      className="rounded border border-zinc-100 bg-zinc-50/50 px-2.5 py-2"
                    >
                      <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.client}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-zinc-700">
                        {p.allocatedHours.toFixed(1)}h &middot; {p.staffCount} staff
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Staff summary */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Staff
              </h3>
              {detail.staff.length === 0 ? (
                <p className="text-sm text-zinc-400">No staff in this office.</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {detail.staff.map((s) => {
                    const over = s.allocatedHours > s.capacityHours;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between border-b border-zinc-100 py-1.5 text-sm"
                      >
                        <div>
                          <p className="font-medium text-zinc-900">{s.name}</p>
                          {s.jobTitle && (
                            <p className="text-xs text-zinc-500">{s.jobTitle}</p>
                          )}
                        </div>
                        <div className="text-right tabular-nums">
                          <p
                            className={
                              over ? "font-semibold text-red-700" : "text-zinc-700"
                            }
                          >
                            {s.allocatedHours.toFixed(0)}/{s.capacityHours.toFixed(0)}h
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
