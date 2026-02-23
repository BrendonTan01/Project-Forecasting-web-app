import type { ProjectHealthStatus } from "@/lib/types";

/**
 * Project health status logic:
 * - overrun: actual_hours > estimated_hours
 * - at_risk: actual_hours > 90% of estimated (i.e. >10% over)
 * - on_track: otherwise
 * - no_estimate: estimated_hours is 0 or null
 */
export function getProjectHealthStatus(
  actualHours: number,
  estimatedHours: number | null
): ProjectHealthStatus {
  if (estimatedHours == null || estimatedHours <= 0) {
    return "no_estimate";
  }

  const ratio = actualHours / estimatedHours;

  if (ratio > 1) return "overrun";
  if (ratio > 0.9) return "at_risk";
  return "on_track";
}

/**
 * Get display label for health status
 */
export function getProjectHealthLabel(status: ProjectHealthStatus): string {
  switch (status) {
    case "on_track":
      return "On track";
    case "at_risk":
      return "At risk";
    case "overrun":
      return "Overrun";
    case "no_estimate":
      return "No estimate";
    default:
      return "Unknown";
  }
}

/**
 * Get colour class for health status (warnings only)
 */
export function getProjectHealthColour(status: ProjectHealthStatus): string {
  switch (status) {
    case "on_track":
      return "text-zinc-600";
    case "at_risk":
      return "text-amber-600";
    case "overrun":
      return "text-red-600";
    case "no_estimate":
      return "text-zinc-500";
    default:
      return "text-zinc-600";
  }
}
