"use client";

import { useState, useCallback, useRef } from "react";
import type {
  CapacityPlannerResponse,
  StaffPlannerRow,
  AssignmentCell,
} from "@/app/api/capacity-planner/route";
import StaffSummaryPanel from "./StaffSummaryPanel";

interface Props {
  initialData: CapacityPlannerResponse;
  canEdit: boolean;
}

interface DragState {
  assignmentId: string;
  fromStaffId: string;
  fromWeekStart: string;
  weeklyHoursAllocated: number;
}

interface PendingMove {
  drag: DragState;
  toStaffId: string;
  toWeekStart: string;
}

function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function StatusBadge({
  status,
  assignedHours,
  capacityHours,
}: {
  status: "available" | "full" | "overbooked";
  assignedHours: number;
  capacityHours: number;
}) {
  if (status === "overbooked") {
    const over = (assignedHours - capacityHours).toFixed(1);
    return (
      <span className="block text-xs font-semibold text-red-700">
        OVERBOOKED BY {over}h
      </span>
    );
  }
  if (status === "full") {
    return (
      <span className="block text-xs font-semibold text-amber-700">FULL</span>
    );
  }
  return (
    <span className="block text-xs text-green-700">AVAILABLE</span>
  );
}

function cellBg(status: "available" | "full" | "overbooked"): string {
  if (status === "overbooked") return "bg-red-50 border-red-200";
  if (status === "full") return "bg-amber-50 border-amber-200";
  return "bg-green-50 border-green-200";
}

export default function CapacityPlannerClient({
  initialData,
  canEdit,
}: Props) {
  const [data, setData] = useState<CapacityPlannerResponse>(initialData);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // "staffId::weekStart"
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const dragRef = useRef<DragState | null>(null);

  const selectedStaff = data.staff.find((s) => s.id === selectedStaffId) ?? null;

  // Re-fetch the grid after a PATCH
  const refreshData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/capacity-planner", { cache: "no-store" });
      if (res.ok) {
        const fresh = (await res.json()) as CapacityPlannerResponse;
        setData(fresh);
      } else {
        const body = await res.json().catch(() => ({}));
        setErrorMsg((body as { error?: string }).error ?? "Refresh failed");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Drag handlers ───────────────────────────────────────────────

  const handleDragStart = useCallback(
    (
      e: React.DragEvent,
      assignment: AssignmentCell,
      staffId: string,
      weekStart: string
    ) => {
      dragRef.current = {
        assignmentId: assignment.id,
        fromStaffId: staffId,
        fromWeekStart: weekStart,
        weeklyHoursAllocated: assignment.weekly_hours_allocated,
      };
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, staffId: string, weekStart: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(`${staffId}::${weekStart}`);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const executeMove = useCallback(
    async (pending: PendingMove, moveScope: "single" | "future") => {
      setPendingMove(null);
      const { drag, toStaffId, toWeekStart } = pending;
      setLoading(true);
      setErrorMsg(null);

      try {
        const body: Record<string, unknown> = {
          assignment_id: drag.assignmentId,
          source_week_start: drag.fromWeekStart,
          week_start: toWeekStart,
          move_scope: moveScope,
        };

        if (drag.fromStaffId !== toStaffId) {
          body.staff_id = toStaffId;
        }

        // Preserve allocated hours unless changed in future UX.
        body.weekly_hours_allocated = drag.weeklyHoursAllocated;

        const res = await fetch("/api/project-assignment", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          setErrorMsg(
            (errBody as { error?: string }).error ?? "Update failed"
          );
          return;
        }

        await refreshData();
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Network error");
      } finally {
        setLoading(false);
        dragRef.current = null;
      }
    },
    [refreshData]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent, toStaffId: string, toWeekStart: string) => {
      e.preventDefault();
      setDragOver(null);

      const drag = dragRef.current;
      if (!drag) return;

      // No-op if dropped onto the same cell
      if (
        drag.fromStaffId === toStaffId &&
        drag.fromWeekStart === toWeekStart
      ) {
        return;
      }

      setPendingMove({
        drag,
        toStaffId,
        toWeekStart,
      });
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDragOver(null);
    dragRef.current = null;
  }, []);

  // ─── Legend ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      {/* Main grid */}
      <div className="min-w-0 flex-1">
        {/* Legend + controls */}
        <div className="app-toolbar mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto px-3 py-2 text-xs sm:flex-wrap sm:gap-4 sm:overflow-visible">
          <span className="app-section-caption !text-[11px]">Capacity signal legend</span>
          <span className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1">
            <span className="inline-block h-3 w-3 rounded bg-green-100 border border-green-300" />
            AVAILABLE (&lt;80%)
          </span>
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1">
            <span className="inline-block h-3 w-3 rounded bg-amber-100 border border-amber-300" />
            FULL (80–100%)
          </span>
          <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1">
            <span className="inline-block h-3 w-3 rounded bg-red-100 border border-red-300" />
            OVERBOOKED (&gt;100%)
          </span>
          {canEdit && (
            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-500">
              Drag an assignment to reassign staff or week.
            </span>
          )}
          {loading && (
            <span className="text-zinc-400 italic">Updating...</span>
          )}
        </div>

        {errorMsg && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Scrollable grid */}
        <div className="app-table-wrap">
          <table className="min-w-max border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50">
                <th className="sticky left-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-3 py-2 text-left font-semibold text-zinc-700 min-w-[180px]">
                  Staff member
                </th>
                {data.weeks.map((w) => (
                  <th
                    key={w}
                    className="border-b border-r border-zinc-200 px-2 py-2 text-center font-semibold text-zinc-600 min-w-[150px]"
                  >
                    <div>{formatWeekLabel(w)}</div>
                    <div className="text-zinc-400 font-normal">Wk of {w}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.staff.map((staffMember) => (
                <StaffRow
                  key={staffMember.id}
                  staff={staffMember}
                  weeks={data.weeks}
                  canEdit={canEdit}
                  dragOver={dragOver}
                  isSelected={selectedStaffId === staffMember.id}
                  onSelectStaff={() =>
                    setSelectedStaffId((prev) =>
                      prev === staffMember.id ? null : staffMember.id
                    )
                  }
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
              {data.staff.length === 0 && (
                <tr>
                  <td
                    colSpan={data.weeks.length + 1}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    No staff profiles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff summary sidebar */}
      {selectedStaff && (
        <StaffSummaryPanel
          staff={selectedStaff}
          weeks={data.weeks}
          onClose={() => setSelectedStaffId(null)}
        />
      )}

      {pendingMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-[var(--shadow-pop)]">
            {(() => {
              const fromStaffName =
                data.staff.find((s) => s.id === pendingMove.drag.fromStaffId)?.name ??
                "Unknown staff";
              const toStaffName =
                data.staff.find((s) => s.id === pendingMove.toStaffId)?.name ??
                "Unknown staff";
              return (
                <div className="mb-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                  <div>
                    <span className="font-medium">{fromStaffName}</span> (
                    {formatWeekLabel(pendingMove.drag.fromWeekStart)}){" "}
                    {"\u2192"}{" "}
                    <span className="font-medium">{toStaffName}</span> (
                    {formatWeekLabel(pendingMove.toWeekStart)})
                  </div>
                  <div className="text-zinc-500">
                    {pendingMove.drag.weeklyHoursAllocated.toFixed(1)}h allocation
                  </div>
                </div>
              );
            })()}
            <h3 className="text-sm font-semibold text-zinc-900">
              Move assignment scope
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Choose how much of this assignment series to move.
            </p>

            <div className="mt-4 space-y-2">
              <button
                className="app-btn app-btn-secondary focus-ring w-full justify-start px-3 py-2 text-left text-sm transition-colors"
                onClick={() => executeMove(pendingMove, "single")}
              >
                Move only this week
              </button>
              <button
                className="app-btn app-btn-secondary focus-ring w-full justify-start px-3 py-2 text-left text-sm transition-colors"
                onClick={() => executeMove(pendingMove, "future")}
              >
                Move this and all future weeks
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
                onClick={() => {
                  setPendingMove(null);
                  dragRef.current = null;
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StaffRow sub-component ─────────────────────────────────────────────────

interface StaffRowProps {
  staff: StaffPlannerRow;
  weeks: string[];
  canEdit: boolean;
  dragOver: string | null;
  isSelected: boolean;
  onSelectStaff: () => void;
  onDragStart: (
    e: React.DragEvent,
    assignment: AssignmentCell,
    staffId: string,
    weekStart: string
  ) => void;
  onDragOver: (e: React.DragEvent, staffId: string, weekStart: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, staffId: string, weekStart: string) => void;
  onDragEnd: () => void;
}

function StaffRow({
  staff,
  weeks,
  canEdit,
  dragOver,
  isSelected,
  onSelectStaff,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: StaffRowProps) {
  return (
    <tr className="border-b border-zinc-100">
      {/* Sticky staff name column */}
      <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2 shadow-[6px_0_8px_-9px_rgba(15,23,42,0.35)]">
        <button
          onClick={onSelectStaff}
          className={`w-full text-left ${
            isSelected ? "font-semibold text-zinc-900" : "text-zinc-700 hover:text-zinc-900"
          }`}
        >
          <div className="font-medium">{staff.name}</div>
          {staff.job_title && (
            <div className="text-zinc-400">{staff.job_title}</div>
          )}
          <div className="text-zinc-400">{staff.weekly_capacity_hours}h/wk</div>
        </button>
      </td>

      {/* Week cells */}
      {weeks.map((weekStart) => {
        const cell = staff.weeks[weekStart];
        const isDragTarget = dragOver === `${staff.id}::${weekStart}`;

        return (
          <td
            key={weekStart}
            className={`border-r border-zinc-100 p-1 align-top transition-colors ${
              isDragTarget ? "ring-2 ring-inset ring-blue-500 bg-blue-50 app-grid-highlight" : ""
            }`}
            onDragOver={canEdit ? (e) => onDragOver(e, staff.id, weekStart) : undefined}
            onDragLeave={canEdit ? onDragLeave : undefined}
            onDrop={canEdit ? (e) => onDrop(e, staff.id, weekStart) : undefined}
          >
            {cell && (
              <div
                className={`min-h-[64px] rounded-md border p-1.5 ${cellBg(cell.status)}`}
              >
                {/* Assignments */}
                {cell.assignments.length === 0 ? (
                  <div className="text-zinc-300 text-center py-1.5">—</div>
                ) : (
                  <div className="space-y-1">
                    {cell.assignments.map((a) => (
                      <div
                        key={a.id}
                        draggable={canEdit}
                        onDragStart={
                          canEdit
                            ? (e) => onDragStart(e, a, staff.id, weekStart)
                            : undefined
                        }
                        onDragEnd={canEdit ? onDragEnd : undefined}
                        className={`rounded-md border bg-white px-1.5 py-1 text-xs shadow-sm ${
                          canEdit
                            ? "cursor-grab active:cursor-grabbing border-zinc-200 hover:border-zinc-400"
                            : "border-zinc-100"
                        }`}
                        title={
                          canEdit ? "Drag to reassign staff or week" : undefined
                        }
                      >
                        <div className="font-medium text-zinc-800 truncate max-w-[120px]">
                          {a.project_name}
                        </div>
                        <div className="text-zinc-500">
                          {a.weekly_hours_allocated}h
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Capacity summary */}
                <div className="mt-1 border-t border-zinc-200 pt-1">
                  <div className="text-zinc-500 font-medium">
                    {cell.assigned_hours.toFixed(1)}/{cell.capacity_hours}h
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/80">
                    <div
                      className={`h-full ${
                        cell.status === "overbooked"
                          ? "bg-red-500"
                          : cell.status === "full"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, (cell.assigned_hours / Math.max(1, cell.capacity_hours)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                  <StatusBadge
                    status={cell.status}
                    assignedHours={cell.assigned_hours}
                    capacityHours={cell.capacity_hours}
                  />
                </div>
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}
