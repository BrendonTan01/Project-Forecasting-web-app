"use client";

import { useEffect, useState } from "react";

interface StaffingWeek {
  week_start: string;
  staffing_gap: number;
  additional_staff_needed: number;
}

interface StaffingResponse {
  weeks: StaffingWeek[];
  planning_hours_per_person_per_week?: number;
}

function formatHoursWithPeople(
  staffingGap: number,
  planningHoursPerPersonPerWeek: number
): string {
  return `${staffingGap.toFixed(1)}h (${(staffingGap / planningHoursPerPersonPerWeek).toFixed(2)} people)`;
}

export function StaffingGapsTable({ weeks = 12 }: { weeks?: number }) {
  const [data, setData] = useState<StaffingWeek[]>([]);
  const [planningHoursPerPersonPerWeek, setPlanningHoursPerPersonPerWeek] = useState(40);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dashboard/staffing?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<StaffingResponse>;
      })
      .then((json) => {
        setData(json.weeks);
        setPlanningHoursPerPersonPerWeek(
          Number(json.planning_hours_per_person_per_week ?? 40)
        );
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [weeks]);

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-500">Failed to load: {error}</p>;
  if (!data.length) return <p className="text-sm text-zinc-500">No data available.</p>;

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-zinc-500">
        People equivalent uses {planningHoursPerPersonPerWeek.toFixed(1)}h per person per week.
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-zinc-50">
            <th className="px-3 py-2 text-left font-medium text-zinc-700">Week Start</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-700">Staffing Gap</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-700">Additional Staff Needed (people)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.week_start} className="border-b hover:bg-zinc-50">
              <td className="px-3 py-2 tabular-nums">{row.week_start}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span className={Number(row.staffing_gap) > 0 ? "text-red-600" : "text-green-600"}>
                  {formatHoursWithPeople(
                    Number(row.staffing_gap),
                    planningHoursPerPersonPerWeek
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.additional_staff_needed > 0 ? row.additional_staff_needed : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
