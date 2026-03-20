import type { ForecastWeek, HiringRecommendation } from "./types";

type StaffingRiskLevel = "High" | "Medium" | "None";

export function getDemandUtilizationPercent(demandHours: number, totalCapacity: number): number {
  if (totalCapacity <= 0) return 0;
  return (demandHours / totalCapacity) * 100;
}

export function deriveForecastKpis(
  weeks: ForecastWeek[],
  hiringRecommendations: HiringRecommendation[]
): {
  currentUtilization: number;
  expectedUtilization: number;
  staffingRisk: StaffingRiskLevel;
  totalStaffNeeded: number;
} {
  const currentUtilization = weeks.length > 0 ? weeks[0].utilization_rate * 100 : 0;

  const validWeeks = weeks.filter((w) => w.total_capacity > 0);
  const expectedUtilization =
    validWeeks.length > 0
      ? validWeeks.reduce(
          (sum, week) =>
            sum + getDemandUtilizationPercent(week.expected_demand, week.total_capacity),
          0
        ) / validWeeks.length
      : 0;

  const staffingRisk: StaffingRiskLevel =
    hiringRecommendations.length > 2
      ? "High"
      : hiringRecommendations.length > 0
        ? "Medium"
        : "None";

  const totalStaffNeeded = hiringRecommendations.reduce(
    (sum, recommendation) => sum + recommendation.staff_needed,
    0
  );

  return { currentUtilization, expectedUtilization, staffingRisk, totalStaffNeeded };
}

export function getUtilizationAccentColor(utilization: number): string {
  if (utilization > 110) return "#b45309";
  if (utilization < 60) return "#6b7280";
  return "#047857";
}

export function getRiskAccentColor(risk: StaffingRiskLevel): string {
  if (risk === "High") return "#b91c1c";
  if (risk === "Medium") return "#b45309";
  return "#047857";
}
