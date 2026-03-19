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
  recommendation,
}: {
  label: string;
  value: string;
  subtext?: string;
  valueColor: string;
  recommendation: string;
}) {
  return (
    <div className="app-metric-card">
      <p className="app-metric-label">{label}</p>
      <p className="app-metric-value mt-1" style={{ color: valueColor }}>
        {value}
      </p>
      {subtext && <p className="app-metric-footnote mt-1">{subtext}</p>}
      <p className="mt-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1.5 text-xs font-medium text-zinc-700">
        {recommendation}
      </p>
    </div>
  );
}

export function DashboardKpiCards({ weeks, hiringRecommendations }: Props) {
  const { currentUtilization, expectedUtilization, staffingRisk, totalStaffNeeded } =
    deriveForecastKpis(weeks, hiringRecommendations);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Current Utilization"
        value={`${currentUtilization.toFixed(1)}%`}
        subtext="This week · confirmed projects"
        valueColor={getUtilizationAccentColor(currentUtilization)}
        recommendation={
          currentUtilization > 95
            ? "Action: rebalance assignments this week."
            : currentUtilization < 70
              ? "Action: review bench for proposal support."
              : "Action: keep current allocation mix."
        }
      />
      <KpiCard
        label="Expected Utilization"
        value={`${expectedUtilization.toFixed(1)}%`}
        subtext="12-week avg · incl. proposals"
        valueColor="#1d4ed8"
        recommendation={
          expectedUtilization > 95
            ? "Action: assess hiring pipeline urgency."
            : "Action: track demand assumptions weekly."
        }
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
        recommendation={
          staffingRisk === "High"
            ? "Action: prioritize critical skill gap mitigation."
            : staffingRisk === "Medium"
              ? "Action: monitor flagged roles and start backup sourcing."
              : "Action: maintain current staffing posture."
        }
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
        recommendation={
          totalStaffNeeded > 0
            ? "Action: confirm reqs with office leads."
            : "Action: no hiring changes required."
        }
      />
    </div>
  );
}
