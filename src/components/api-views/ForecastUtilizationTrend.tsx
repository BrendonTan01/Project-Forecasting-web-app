"use client";

import { useEffect, useState } from "react";
import { UtilizationForecastChart } from "@/components/dashboard/UtilizationForecastChart";
import type { ForecastResponse } from "@/components/dashboard/types";

export function ForecastUtilizationTrend({ weeks = 12 }: { weeks?: number }) {
  const [series, setSeries] = useState<ForecastResponse["weeks"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/forecast?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<ForecastResponse>;
      })
      .then((json) => setSeries(json.weeks))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [weeks]);

  if (loading) return <p className="text-sm text-[color:var(--muted-text)]">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">Failed to load: {error}</p>;
  if (!series.length) return <p className="text-sm text-[color:var(--muted-text)]">No data available.</p>;

  return <UtilizationForecastChart weeks={series} />;
}
