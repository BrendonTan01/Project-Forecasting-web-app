"use client";

import { useEffect, useMemo, useState } from "react";
import type { HiringRecommendation, SkillShortage } from "@/lib/types";

type ForecastWeek = {
  week_start: string;
  staffing_gap: number;
};

type ForecastInsightsResponse = {
  weeks: ForecastWeek[];
  skill_shortages: SkillShortage[];
  hiring_recommendations: HiringRecommendation[];
  planning_hours_per_person_per_week?: number;
};

type RoleGapRow = {
  role: string;
  gapFte: number;
};

function buildRoleRows(
  skillShortages: SkillShortage[],
  planningHoursPerPersonPerWeek: number
): RoleGapRow[] {
  return [...skillShortages]
    .sort((a, b) => Number(b.shortage) - Number(a.shortage))
    .slice(0, 3)
    .map((shortage) => ({
      role: shortage.skill,
      gapFte:
        Number(shortage.shortage) > 0
          ? -(Number(shortage.shortage) / Math.max(1, planningHoursPerPersonPerWeek))
          : 0,
    }));
}

function buildInsightText(
  recommendations: HiringRecommendation[],
  weeks: ForecastWeek[]
): string {
  const topRecommendation = recommendations[0];
  if (topRecommendation) {
    const windowWeeks = Math.max(1, Number(topRecommendation.recommended_hiring_window_weeks || 1));
    return `${topRecommendation.skill} capacity is projected to bottleneck. Plan to add ${topRecommendation.staff_needed} FTE within ${windowWeeks} week${windowWeeks === 1 ? "" : "s"} to protect delivery timelines.`;
  }

  const peakGap = weeks.reduce<{ gap: number; weekIndex: number }>(
    (best, row, index) => {
      const gap = Number(row.staffing_gap ?? 0);
      if (gap > best.gap) {
        return { gap, weekIndex: index + 1 };
      }
      return best;
    },
    { gap: 0, weekIndex: 0 }
  );

  if (peakGap.gap > 0) {
    return `Week ${peakGap.weekIndex} has the highest demand pressure with a ${Math.round(peakGap.gap)} hour capacity gap. Consider re-sequencing project starts or augmenting with short-term support.`;
  }

  return "No critical staffing bottlenecks are currently forecasted. Continue monitoring utilization and keep a hiring buffer for upcoming changes in demand.";
}

export function ForecastRoleInsights({ weeks = 10 }: { weeks?: number }) {
  const [data, setData] = useState<ForecastInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/forecast?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<ForecastInsightsResponse>;
      })
      .then((json) => setData(json))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load role insights")
      )
      .finally(() => setLoading(false));
  }, [weeks]);

  const planningHoursPerPersonPerWeek = Number(data?.planning_hours_per_person_per_week ?? 40);
  const roleRows = useMemo(
    () => buildRoleRows(data?.skill_shortages ?? [], planningHoursPerPersonPerWeek),
    [data?.skill_shortages, planningHoursPerPersonPerWeek]
  );
  const rowsToRender =
    roleRows.length > 0
      ? roleRows
      : [
          { role: "Product Designers", gapFte: 0 },
          { role: "Full Stack Engineers", gapFte: 0 },
          { role: "Project Managers", gapFte: 0 },
        ];
  const maxGap = Math.max(...rowsToRender.map((item) => Math.abs(item.gapFte)), 1);
  const insightText = buildInsightText(data?.hiring_recommendations ?? [], data?.weeks ?? []);

  if (loading) {
    return (
      <section className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <article className="app-panel h-[268px] animate-pulse bg-zinc-50" />
        <article className="app-panel h-[268px] animate-pulse bg-zinc-100" />
      </section>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">Failed to load role insights: {error}</p>;
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
      <article className="app-panel">
        <div className="app-panel-body space-y-5">
          <div>
            <h3 className="text-base font-semibold text-zinc-800">Staffing Gaps by Role</h3>
          </div>

          <div className="space-y-4">
            {rowsToRender.map((item) => {
              const isShortage = item.gapFte < 0;
              const magnitude = Math.abs(item.gapFte);
              const display = isShortage ? `-${magnitude.toFixed(1)} FTE` : "Optimal";
              const width = isShortage ? `${Math.max((magnitude / maxGap) * 100, 8)}%` : "100%";

              return (
                <div key={item.role} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <p className="font-medium text-zinc-700">{item.role}</p>
                    <p className={isShortage ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
                      {display}
                    </p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-indigo-100/80">
                    <div
                      className={isShortage ? "h-full rounded-full bg-red-600" : "h-full rounded-full bg-indigo-200"}
                      style={{ width }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </article>

      <article className="app-panel overflow-hidden border-0 bg-[#0f1d3d] text-white shadow-[0_12px_32px_rgb(15_29_61/34%)]">
        <div className="app-panel-body flex h-full flex-col justify-between gap-6 p-6">
          <div className="space-y-4">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <span className="h-3 w-3 rounded-full bg-white" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Strategic Insight</h3>
              <p className="mt-3 text-sm leading-6 text-white/85">{insightText}</p>
            </div>
          </div>
          <button
            type="button"
            className="w-full rounded-xl border border-white/10 bg-white px-4 py-2.5 text-sm font-semibold text-[#0f1d3d] transition hover:bg-zinc-100"
          >
            Draft Resource Request
          </button>
        </div>
      </article>
    </section>
  );
}
