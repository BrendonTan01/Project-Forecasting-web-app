import type { ForecastWeek, HiringRecommendation } from "./types";

interface Props {
  weeks: ForecastWeek[];
  hiringRecommendations: HiringRecommendation[];
}

function deriveKpis(weeks: ForecastWeek[], hiringRecommendations: HiringRecommendation[]) {
  const currentUtilization = weeks.length > 0 ? weeks[0].utilization_rate * 100 : 0;

  const validWeeks = weeks.filter((w) => w.total_capacity > 0);
  const expectedUtilization =
    validWeeks.length > 0
      ? validWeeks.reduce(
          (sum, w) => sum + (w.expected_demand / w.total_capacity) * 100,
          0
        ) / validWeeks.length
      : 0;

  const staffingRisk =
    hiringRecommendations.length > 2
      ? "High"
      : hiringRecommendations.length > 0
        ? "Medium"
        : "None";

  const totalStaffNeeded = hiringRecommendations.reduce(
    (sum, r) => sum + r.staff_needed,
    0
  );

  return { currentUtilization, expectedUtilization, staffingRisk, totalStaffNeeded };
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
    deriveKpis(weeks, hiringRecommendations);

  const currentUtilColor =
    currentUtilization > 110
      ? "#b45309"
      : currentUtilization < 60
        ? "#6b7280"
        : "#047857";

  const riskColor =
    staffingRisk === "High"
      ? "#b91c1c"
      : staffingRisk === "Medium"
        ? "#b45309"
        : "#047857";

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <KpiCard
        label="Current Utilization"
        value={`${currentUtilization.toFixed(1)}%`}
        subtext="This week · confirmed projects"
        valueColor={currentUtilColor}
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
        valueColor={riskColor}
      />
      <KpiCard
        label="Hiring Outlook"
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
