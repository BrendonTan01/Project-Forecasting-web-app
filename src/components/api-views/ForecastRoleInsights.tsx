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
  skill_shortages_by_week?: Array<{
    skill: string;
    weeks: Array<{
      week_start: string;
      balance_hours: number;
    }>;
  }>;
  hiring_recommendations: HiringRecommendation[];
  planning_hours_per_person_per_week?: number;
};

type RoleGapRow = {
  role: string;
  gapFte: number;
};

type InsightSeverity = "Low" | "Medium" | "High" | "Critical";

function getInsightSeverity(
  weeks: ForecastWeek[],
  roleBalancesByWeek: NonNullable<ForecastInsightsResponse["skill_shortages_by_week"]>
): InsightSeverity {
  const maxAggregateGap = weeks.reduce(
    (maxGap, week) => Math.max(maxGap, Number(week.staffing_gap ?? 0)),
    0
  );
  const maxRoleDeficit = roleBalancesByWeek.reduce((maxDeficit, role) => {
    const worstForRole = role.weeks.reduce(
      (worst, week) => Math.max(worst, Math.max(0, Number(week.balance_hours) * -1)),
      0
    );
    return Math.max(maxDeficit, worstForRole);
  }, 0);

  const riskSignal = Math.max(maxAggregateGap, maxRoleDeficit);
  if (riskSignal >= 160) return "Critical";
  if (riskSignal >= 90) return "High";
  if (riskSignal >= 35) return "Medium";
  return "Low";
}

function getSeverityClasses(severity: InsightSeverity): string {
  switch (severity) {
    case "Critical":
      return "border-red-200/40 bg-red-200/20 text-red-100";
    case "High":
      return "border-orange-200/40 bg-orange-200/20 text-orange-100";
    case "Medium":
      return "border-amber-200/40 bg-amber-200/20 text-amber-100";
    default:
      return "border-emerald-200/40 bg-emerald-200/20 text-emerald-100";
  }
}

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
  weeks: ForecastWeek[],
  roleBalancesByWeek: NonNullable<ForecastInsightsResponse["skill_shortages_by_week"]>
): string {
  const worstRoleDeficit = roleBalancesByWeek.reduce<{
    skill: string;
    deficitHours: number;
    weekIndex: number;
  } | null>((worst, role) => {
    role.weeks.forEach((week, index) => {
      const deficit = Math.max(0, Number(week.balance_hours) * -1);
      if (!worst || deficit > worst.deficitHours) {
        worst = {
          skill: role.skill,
          deficitHours: deficit,
          weekIndex: index + 1,
        };
      }
    });
    return worst;
  }, null);

  const topRecommendation = recommendations[0];
  if (topRecommendation && worstRoleDeficit && worstRoleDeficit.deficitHours > 0) {
    const windowWeeks = Math.max(1, Number(topRecommendation.recommended_hiring_window_weeks || 1));
    return `${topRecommendation.skill} is the top delivery risk, peaking at a ${Math.round(worstRoleDeficit.deficitHours)} hour role deficit in WK ${worstRoleDeficit.weekIndex}. Add ${topRecommendation.staff_needed} FTE within ${windowWeeks} week${windowWeeks === 1 ? "" : "s"} to stabilize forecasted demand.`;
  }

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
    if (worstRoleDeficit && worstRoleDeficit.deficitHours > 0) {
      return `Week ${peakGap.weekIndex} has the highest overall demand pressure, while ${worstRoleDeficit.skill} is the most constrained role in WK ${worstRoleDeficit.weekIndex} (${Math.round(worstRoleDeficit.deficitHours)}h deficit). Consider shifting lower-priority scope or temporary backfill for that role.`;
    }

    return `Week ${peakGap.weekIndex} has the highest demand pressure with a ${Math.round(peakGap.gap)} hour capacity gap. Consider re-sequencing project starts or augmenting with short-term support.`;
  }

  if (worstRoleDeficit && worstRoleDeficit.deficitHours > 0) {
    return `${worstRoleDeficit.skill} has the largest role-level shortfall at ${Math.round(worstRoleDeficit.deficitHours)} hours in WK ${worstRoleDeficit.weekIndex}, even though aggregate capacity remains stable. Monitor role assignments and pre-plan targeted hiring.`;
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
  const insightText = buildInsightText(
    data?.hiring_recommendations ?? [],
    data?.weeks ?? [],
    data?.skill_shortages_by_week ?? []
  );
  const insightSeverity = getInsightSeverity(
    data?.weeks ?? [],
    data?.skill_shortages_by_week ?? []
  );

  if (loading) {
    return (
      <section className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <article className="app-panel h-[268px] animate-pulse bg-zinc-50" />
        <article className="app-panel h-[268px] animate-pulse bg-zinc-100" />
      </section>
    );
  }

  const safeInsightText = error
    ? "Insight data is temporarily unavailable. Review weekly utilization and staffing gap trends while the forecast service reconnects."
    : insightText;

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

      <article className="overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-[#0f1d3d] text-white shadow-[0_12px_32px_rgb(15_29_61/34%)]">
        <div className="flex h-full min-h-[220px] flex-col gap-6 p-6">
          <div className="space-y-4">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <span className="h-3 w-3 rounded-full bg-white" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-2xl font-semibold tracking-tight">Strategic Insight</h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getSeverityClasses(
                    insightSeverity
                  )}`}
                >
                  {insightSeverity}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/85">{safeInsightText}</p>
              {error ? <p className="mt-2 text-xs text-amber-200">Data fetch warning: {error}</p> : null}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
