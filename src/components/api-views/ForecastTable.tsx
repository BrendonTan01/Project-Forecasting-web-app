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

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

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

  const weekLabels = data.map((_, index) => `WK ${index + 1}`);
  const capacityValues = data.map((row) => integerFormatter.format(Number(row.total_capacity)));
  const projectHourValues = data.map((row) =>
    integerFormatter.format(Number(row.total_project_hours))
  );
  const utilizationValues = data.map((row) => Number(row.utilization_rate) * 100);

  return (
    <div className="app-table-wrap">
      <table className="app-table app-table-comfortable min-w-[840px]">
        <thead>
          <tr>
            <th className="text-left">Metric</th>
            {weekLabels.map((label) => (
              <th key={label} className="text-right">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-semibold text-zinc-700">Capacity (h)</td>
            {capacityValues.map((value, index) => (
              <td key={`capacity-${index}`} className="text-right tabular-nums text-zinc-700">
                {value}
              </td>
            ))}
          </tr>
          <tr>
            <td className="font-semibold text-zinc-700">Project Hours</td>
            {projectHourValues.map((value, index) => (
              <td key={`project-${index}`} className="text-right tabular-nums text-zinc-700">
                {value}
              </td>
            ))}
          </tr>
          <tr>
            <td className="font-semibold text-zinc-700">Utilization %</td>
            {utilizationValues.map((value, index) => (
              <td
                key={`utilization-${index}`}
                className={`text-right tabular-nums font-semibold ${
                  value > 100 ? "text-red-600" : "text-zinc-700"
                }`}
              >
                {Math.round(value)}%
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
