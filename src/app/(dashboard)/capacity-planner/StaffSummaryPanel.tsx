"use client";

import type { StaffPlannerRow } from "@/app/api/capacity-planner/route";

interface StaffSummaryPanelProps {
  staff: StaffPlannerRow;
  weeks: string[];
  onClose: () => void;
}

function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function StaffSummaryPanel({
  staff,
  weeks,
  onClose,
}: StaffSummaryPanelProps) {
  const totalAssigned = weeks.reduce((sum, w) => {
    return sum + (staff.weeks[w]?.assigned_hours ?? 0);
  }, 0);

  const avgUtilization =
    weeks.length > 0
      ? weeks.reduce((sum, w) => sum + (staff.weeks[w]?.utilization ?? 0), 0) /
        weeks.length
      : 0;

  const overbookedWeeks = weeks.filter(
    (w) => staff.weeks[w]?.status === "overbooked"
  );

  return (
    <div className="w-72 shrink-0 rounded border border-zinc-200 bg-white p-4 text-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="font-semibold text-zinc-900">{staff.name}</p>
          {staff.job_title && (
            <p className="text-zinc-500">{staff.job_title}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 text-zinc-400 hover:text-zinc-700"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Summary stats */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded bg-zinc-50 p-2">
          <p className="text-xs text-zinc-500">Weekly capacity</p>
          <p className="font-semibold text-zinc-900">
            {staff.weekly_capacity_hours}h
          </p>
        </div>
        <div className="rounded bg-zinc-50 p-2">
          <p className="text-xs text-zinc-500">Avg utilization</p>
          <p
            className={`font-semibold ${
              avgUtilization > 1
                ? "text-red-600"
                : avgUtilization >= 0.8
                ? "text-amber-600"
                : "text-green-600"
            }`}
          >
            {(avgUtilization * 100).toFixed(0)}%
          </p>
        </div>
        <div className="col-span-2 rounded bg-zinc-50 p-2">
          <p className="text-xs text-zinc-500">
            Total assigned (next {weeks.length} weeks)
          </p>
          <p className="font-semibold text-zinc-900">
            {totalAssigned.toFixed(1)}h
          </p>
        </div>
      </div>

      {/* Overbooking alert */}
      {overbookedWeeks.length > 0 && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-2">
          <p className="font-semibold text-red-700">
            Overbooked in {overbookedWeeks.length} week
            {overbookedWeeks.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-red-600">
            {overbookedWeeks.map((w) => {
              const cell = staff.weeks[w];
              const over = (cell.assigned_hours - cell.capacity_hours).toFixed(
                1
              );
              return (
                <li key={w}>
                  {formatWeekLabel(w)}: +{over}h over
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Per-week breakdown */}
      <p className="mb-2 font-medium text-zinc-700">Week-by-week</p>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-1 text-left text-zinc-500">Week</th>
              <th className="py-1 text-right text-zinc-500">Assigned</th>
              <th className="py-1 text-right text-zinc-500">Util%</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const cell = staff.weeks[w];
              const util = ((cell?.utilization ?? 0) * 100).toFixed(0);
              const isOver = cell?.status === "overbooked";
              const isFull = cell?.status === "full";
              return (
                <tr key={w} className="border-b border-zinc-50">
                  <td className="py-1 text-zinc-700">{formatWeekLabel(w)}</td>
                  <td className="py-1 text-right text-zinc-800">
                    {(cell?.assigned_hours ?? 0).toFixed(1)}h
                  </td>
                  <td
                    className={`py-1 text-right font-medium ${
                      isOver
                        ? "text-red-600"
                        : isFull
                        ? "text-amber-600"
                        : "text-green-600"
                    }`}
                  >
                    {util}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
