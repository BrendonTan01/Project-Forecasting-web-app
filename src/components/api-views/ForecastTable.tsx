"use client";

import { useEffect, useState } from "react";

interface ForecastWeek {
  week_start: string;
  total_capacity: number;
  total_project_hours: number;
  utilization_rate: number;
  staffing_gap: number;
}

interface ForecastResponse {
  weeks: ForecastWeek[];
}

export function ForecastTable({ weeks = 12 }: { weeks?: number }) {
  const [data, setData] = useState<ForecastWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/forecast?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<ForecastResponse>;
      })
      .then((json) => setData(json.weeks))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [weeks]);

  if (loading) return <p className="text-sm text-[color:var(--muted-text)]">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">Failed to load: {error}</p>;
  if (!data.length) return <p className="text-sm text-[color:var(--muted-text)]">No data available.</p>;

  return (
    <div className="app-table-wrap">
      <table className="app-table app-table-comfortable min-w-full">
        <thead>
          <tr>
            <th className="text-left">Week Start</th>
            <th className="text-right">Total Capacity (hrs)</th>
            <th className="text-right">Project Hours (hrs)</th>
            <th className="text-right">Utilization %</th>
            <th className="text-right">Staffing Gap (hrs)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.week_start}>
              <td className="tabular-nums">{row.week_start}</td>
              <td className="text-right tabular-nums">
                {Number(row.total_capacity).toFixed(1)}
              </td>
              <td className="text-right tabular-nums">
                {Number(row.total_project_hours).toFixed(1)}
              </td>
              <td className="text-right tabular-nums">
                {(row.utilization_rate * 100).toFixed(1)}%
              </td>
              <td className="text-right tabular-nums">
                <span className={Number(row.staffing_gap) > 0 ? "text-red-600" : "text-green-600"}>
                  {Number(row.staffing_gap).toFixed(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
