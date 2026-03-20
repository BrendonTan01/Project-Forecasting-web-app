"use client";

import { useEffect, useMemo, useState } from "react";

type SkillWeekBalance = {
  week_start: string;
  balance_hours: number;
};

type SkillBalanceByWeek = {
  skill: string;
  weeks: SkillWeekBalance[];
};

type ForecastRoleBalanceResponse = {
  skill_shortages_by_week: SkillBalanceByWeek[];
};

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatSignedHours(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${integerFormatter.format(rounded)}`;
  if (rounded < 0) return `-${integerFormatter.format(Math.abs(rounded))}`;
  return "0";
}

export function StaffingRoleGapMatrix({ weeks = 12 }: { weeks?: number }) {
  const [rows, setRows] = useState<SkillBalanceByWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch(`/api/forecast?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<ForecastRoleBalanceResponse>;
      })
      .then((json) => setRows(json.skill_shortages_by_week ?? []))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load role forecast")
      )
      .finally(() => setLoading(false));
  }, [weeks]);

  const sortedRows = useMemo(() => {
    return rows
      .filter((row) => row.weeks.some((week) => Math.abs(Number(week.balance_hours)) > 0))
      .sort((a, b) => {
        const aWorstDeficit = Math.min(...a.weeks.map((week) => Number(week.balance_hours)));
        const bWorstDeficit = Math.min(...b.weeks.map((week) => Number(week.balance_hours)));
        return aWorstDeficit - bWorstDeficit;
      });
  }, [rows]);

  const visibleRows = showAll ? sortedRows : sortedRows.slice(0, 6);

  if (loading) return <p className="text-sm text-[color:var(--muted-text)]">Loading role breakdown…</p>;
  if (error) return <p className="text-sm text-red-600">Failed to load role breakdown: {error}</p>;
  if (!sortedRows.length) {
    return <p className="text-sm text-[color:var(--muted-text)]">No role-level demand or capacity signals found.</p>;
  }

  const weekCount = visibleRows[0]?.weeks.length ?? 0;
  const weekLabels = Array.from({ length: weekCount }, (_, index) => `WK ${index + 1}`);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--muted-text)]">
          Role-level demand vs capacity (h)
        </p>
        {sortedRows.length > 6 ? (
          <button
            type="button"
            className="app-btn app-btn-secondary px-2.5 py-1 text-[11px]"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Show fewer roles" : "Show all roles"}
          </button>
        ) : null}
      </div>
      <div className="app-table-wrap">
        <table className="app-table app-table-comfortable min-w-[920px]">
          <thead>
            <tr>
              <th className="text-left">Role</th>
              {weekLabels.map((label) => (
                <th key={label} className="text-right">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.skill}>
                <td className="font-semibold text-zinc-700">{row.skill}</td>
                {row.weeks.map((week) => {
                  const value = Number(week.balance_hours);
                  return (
                    <td
                      key={`${row.skill}-${week.week_start}`}
                      className={`text-right tabular-nums font-semibold ${
                        value >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {formatSignedHours(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
