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

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-500">Failed to load: {error}</p>;
  if (!data.length) return <p className="text-sm text-zinc-500">No data available.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-zinc-50">
            <th className="px-3 py-2 text-left font-medium text-zinc-700">Week Start</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-700">Total Capacity (hrs)</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-700">Project Hours (hrs)</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-700">Utilization %</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-700">Staffing Gap (hrs)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.week_start} className="border-b hover:bg-zinc-50">
              <td className="px-3 py-2 tabular-nums">{row.week_start}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {Number(row.total_capacity).toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {Number(row.total_project_hours).toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {(row.utilization_rate * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
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
