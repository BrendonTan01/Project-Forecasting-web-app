"use client";

import { useEffect, useState } from "react";

interface HiringInsight {
  week_start: string;
  utilization_rate: number;
  recommended_hires: number;
  message: string;
}

export function StaffingIntelligenceTable({ weeks = 12 }: { weeks?: number }) {
  const [data, setData] = useState<HiringInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/hiring-insights?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<HiringInsight[]>;
      })
      .then((json) => setData(json))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [weeks]);

  if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;
  if (error) return <p className="text-sm text-red-500">Failed to load: {error}</p>;
  if (!data.length) {
    return (
      <p className="text-sm text-zinc-500">
        No staffing intelligence alerts in the selected forecast window.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-zinc-50">
            <th className="px-3 py-2 text-left font-medium text-zinc-700">Week Start</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-700">Utilization</th>
            <th className="px-3 py-2 text-right font-medium text-zinc-700">Recommended Hires</th>
            <th className="px-3 py-2 text-left font-medium text-zinc-700">Insight</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={`${row.week_start}-${row.message}`} className="border-b hover:bg-zinc-50">
              <td className="px-3 py-2 tabular-nums">{row.week_start}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {(Number(row.utilization_rate) * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.recommended_hires > 0 ? row.recommended_hires : "-"}
              </td>
              <td className="px-3 py-2 text-zinc-700">{row.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
