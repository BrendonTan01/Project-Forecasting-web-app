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

  if (loading) return <p className="text-sm text-[color:var(--muted-text)]">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">Failed to load: {error}</p>;
  if (!data.length) return <p className="text-sm text-[color:var(--muted-text)]">No data available.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[color:var(--muted-text)]">
        People equivalent uses {planningHoursPerPersonPerWeek.toFixed(1)}h per person per week.
      </p>
      <div className="app-table-wrap">
      <table className="app-table app-table-comfortable min-w-full">
        <thead>
          <tr>
            <th className="text-left">Week Start</th>
            <th className="text-right">Staffing Gap</th>
            <th className="text-right">Additional Staff Needed (people)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.week_start}>
              <td className="tabular-nums">{row.week_start}</td>
              <td className="text-right tabular-nums">
                <span className={Number(row.staffing_gap) > 0 ? "text-red-600" : "text-green-600"}>
                  {formatHoursWithPeople(
                    Number(row.staffing_gap),
                    planningHoursPerPersonPerWeek
                  )}
                </span>
              </td>
              <td className="text-right tabular-nums">
                {row.additional_staff_needed > 0 ? row.additional_staff_needed : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
