/**
 * Utilisation calculation: billable_hours_logged / capacity_hours
 * Over a given period.

 * Edge cases:
 * - Part-time: use staff_profiles.weekly_capacity_hours
 * - Missing timesheets: exclude from numerator (use 0 hours)

 * @param billableHours - Billable hours logged in period
 * @param capacityHours - Capacity hours available in period
 * @returns Utilisation as decimal (0-1+) or null if no capacity
 */
export function calculateUtilisation(
  billableHours: number,
  capacityHours: number
): number | null {
  if (capacityHours <= 0) return null;
  return billableHours / capacityHours;
}

/**
 * Format utilisation as percentage string
 */
export function formatUtilisation(utilisation: number | null): string {
  if (utilisation === null) return "N/A";
  return `${(utilisation * 100).toFixed(1)}%`;
}

/**
 * Classify utilisation for UI (underutilised < 60%, overallocated > 110%)
 */
export function getUtilisationStatus(
  utilisation: number | null
): "underutilised" | "healthy" | "overallocated" | "unknown" {
  if (utilisation === null) return "unknown";
  if (utilisation < 0.6) return "underutilised";
  if (utilisation > 1.1) return "overallocated";
  return "healthy";
}
