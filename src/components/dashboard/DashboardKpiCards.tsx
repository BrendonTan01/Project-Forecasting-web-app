import type { ForecastWeek, HiringRecommendation } from "./types";
import {
  deriveForecastKpis,
  getRiskAccentColor,
  getUtilizationAccentColor,
} from "./forecastMetrics";

interface Props {
  weeks: ForecastWeek[];
  hiringRecommendations: HiringRecommendation[];
}

function KpiCard({
  label,
  value,
  subtext,
  valueColor,
}: {
  label: string;
  value: string;
  subtext?: string;
  valueColor: string;
}) {
  return (
    <div className="app-card p-4">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: valueColor }}>
        {value}
      </p>
      {subtext && <p className="mt-1 text-xs text-zinc-400">{subtext}</p>}
    </div>
  );
}

export function DashboardKpiCards({ weeks, hiringRecommendations }: Props) {
  const { currentUtilization, expectedUtilization, staffingRisk, totalStaffNeeded } =
    deriveForecastKpis(weeks, hiringRecommendations);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <KpiCard
        label="Current Utilization"
        value={`${currentUtilization.toFixed(1)}%`}
        subtext="This week · confirmed projects"
        valueColor={getUtilizationAccentColor(currentUtilization)}
      />
      <KpiCard
        label="Expected Utilization"
        value={`${expectedUtilization.toFixed(1)}%`}
        subtext="12-week avg · incl. proposals"
        valueColor="#1d4ed8"
      />
      <KpiCard
        label="Staffing Risk"
        value={staffingRisk}
        subtext={
          hiringRecommendations.length > 0
            ? `${hiringRecommendations.length} skill gap${hiringRecommendations.length !== 1 ? "s" : ""} flagged`
            : "No active shortages"
        }
        valueColor={getRiskAccentColor(staffingRisk)}
      />
      <KpiCard
        label="Hiring Recommendations"
        value={totalStaffNeeded > 0 ? `+${totalStaffNeeded}` : "0"}
        subtext={
          totalStaffNeeded > 0
            ? `${totalStaffNeeded} staff across ${hiringRecommendations.length} role${hiringRecommendations.length !== 1 ? "s" : ""}`
            : "No hiring needed"
        }
        valueColor={totalStaffNeeded > 0 ? "#b45309" : "#047857"}
      />
    </div>
  );
}
