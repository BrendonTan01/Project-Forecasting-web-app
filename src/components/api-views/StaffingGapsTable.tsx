"use client";

import { useEffect, useState } from "react";

interface StaffingWeek {
  week_start: string;
  staffing_gap: number;
  additional_staff_needed: number;
}

interface StaffingResponse {
  weeks: StaffingWeek[];
}

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatSignedWhole(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${integerFormatter.format(rounded)}`;
  if (rounded < 0) return `-${integerFormatter.format(Math.abs(rounded))}`;
  return "0";
}

export function StaffingGapsTable({ weeks = 12 }: { weeks?: number }) {
  const [data, setData] = useState<StaffingWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dashboard/staffing?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<StaffingResponse>;
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

  return (
    <div className="app-table-wrap">
      <table className="app-table app-table-comfortable min-w-[920px]">
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
            <td className="font-semibold text-zinc-700">Demand vs Capacity (h)</td>
            {data.map((row) => {
              const demandVsCapacity = Number(row.staffing_gap) * -1;
              const positive = demandVsCapacity >= 0;
              return (
                <td
                  key={`demand-${row.week_start}`}
                  className={`text-right tabular-nums font-semibold ${
                    positive ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {formatSignedWhole(demandVsCapacity)}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="font-semibold text-zinc-700">Add. Staff Needed (FTE)</td>
            {data.map((row) => {
              const needed = Number(row.additional_staff_needed);
              const hasGap = needed > 0;
              return (
                <td key={`staff-${row.week_start}`} className="text-right tabular-nums text-zinc-700">
                  {hasGap ? (
                    <span className="inline-flex min-w-8 items-center justify-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                      {needed.toFixed(1)}
                    </span>
                  ) : (
                    "0"
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
