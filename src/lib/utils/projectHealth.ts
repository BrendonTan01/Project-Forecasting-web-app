import type { ProjectHealthStatus } from "@/lib/types";

/**
 * Project health status logic:
 * - not_started: start_date is in the future
 * - overrun: actual_hours > estimated_hours
 * - at_risk: likely to exceed estimate based on schedule progress + recent burn trend
 * - on_track: otherwise
 * - no_estimate: estimated_hours is 0 or null
 */
type ProjectHealthOptions = {
  endDate?: string | null;
  recentWeeklyHours?: number[];
  today?: Date;
};
type ProjectHealthAssessment = {
  status: ProjectHealthStatus;
  reason: string;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

function weekStartKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assessProjectHealth(
  actualHours: number,
  estimatedHours: number | null,
  startDate?: string | null,
  options?: ProjectHealthOptions
): ProjectHealthAssessment {
  const today = startOfDay(options?.today ?? new Date());

  if (startDate) {
    const projectStart = startOfDay(new Date(startDate));
    if (projectStart > today) {
      return { status: "not_started", reason: "Project start date is in the future." };
    }
  }

  if (estimatedHours == null || estimatedHours <= 0) {
    return { status: "no_estimate", reason: "No estimate is set for this project." };
  }

  const ratio = actualHours / estimatedHours;

  if (ratio > 1) {
    return {
      status: "overrun",
      reason: `Logged ${actualHours.toFixed(1)}h against ${estimatedHours.toFixed(1)}h estimate.`,
    };
  }

  // Legacy fallback when schedule context is unavailable.
  if (!startDate || !options?.endDate) {
    if (ratio > 0.9) {
      return {
        status: "at_risk",
        reason: `Logged ${(ratio * 100).toFixed(1)}% of estimate and schedule dates are incomplete.`,
      };
    }
    return {
      status: "on_track",
      reason: `Logged ${(ratio * 100).toFixed(1)}% of estimate.`,
    };
  }

  const projectStart = startOfDay(new Date(startDate));
  const projectEnd = startOfDay(new Date(options.endDate));
  if (projectEnd <= projectStart) {
    if (ratio > 0.9) {
      return {
        status: "at_risk",
        reason: `Logged ${(ratio * 100).toFixed(1)}% of estimate and project dates are invalid.`,
      };
    }
    return {
      status: "on_track",
      reason: `Logged ${(ratio * 100).toFixed(1)}% of estimate.`,
    };
  }

  const totalDays = (projectEnd.getTime() - projectStart.getTime()) / (24 * 60 * 60 * 1000);
  const elapsedDays = clamp((today.getTime() - projectStart.getTime()) / (24 * 60 * 60 * 1000), 0, totalDays);
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const elapsedWeeks = Math.max(1, elapsedDays / 7);
  const remainingWeeks = remainingDays / 7;
  const scheduleProgress = totalDays > 0 ? elapsedDays / totalDays : 1;

  // Burn-rate estimate that reacts to recent spikes without being too noisy.
  const recent = (options.recentWeeklyHours ?? []).filter((h) => h > 0);
  const overallBurnPerWeek = actualHours / elapsedWeeks;
  const recentBurnPerWeek = recent.length > 0 ? average(recent) : overallBurnPerWeek;
  const latestWeek = recent.length > 0 ? recent[recent.length - 1] : 0;
  const priorRecentAvg = recent.length > 1 ? average(recent.slice(0, -1)) : recentBurnPerWeek;
  const spikeMultiplier = priorRecentAvg > 0 && latestWeek > priorRecentAvg * 1.35 ? 1.1 : 1;
  const projectedBurnPerWeek = Math.max(overallBurnPerWeek, recentBurnPerWeek * spikeMultiplier);
  const projectedFinalHours = actualHours + projectedBurnPerWeek * remainingWeeks;
  const projectedRatio = projectedFinalHours / estimatedHours;

  // Heuristics:
  // - At risk if projection likely exceeds estimate.
  // - At risk if work burn is materially ahead of schedule early/mid project.
  if (projectedRatio > 1.02) {
    return {
      status: "at_risk",
      reason: `Projected ${projectedFinalHours.toFixed(1)}h / ${estimatedHours.toFixed(1)}h by current burn trend.`,
    };
  }
  if (ratio >= 0.9 && scheduleProgress < 0.8) {
    return {
      status: "at_risk",
      reason: `Already ${(ratio * 100).toFixed(1)}% consumed with ${(scheduleProgress * 100).toFixed(1)}% of schedule elapsed.`,
    };
  }

  return {
    status: "on_track",
    reason: `On pace: ${(ratio * 100).toFixed(1)}% hours consumed with ${(scheduleProgress * 100).toFixed(1)}% schedule elapsed.`,
  };
}

export function getProjectHealthStatus(
  actualHours: number,
  estimatedHours: number | null,
  startDate?: string | null,
  options?: ProjectHealthOptions
): ProjectHealthStatus {
  return assessProjectHealth(actualHours, estimatedHours, startDate, options).status;
}

export function getProjectHealthReason(
  actualHours: number,
  estimatedHours: number | null,
  startDate?: string | null,
  options?: ProjectHealthOptions
): string {
  return assessProjectHealth(actualHours, estimatedHours, startDate, options).reason;
}

type TimeEntryRowLike = {
  project_id: string;
  date: string;
  hours: number | string | null;
};

export function buildRecentWeeklyHoursByProject(
  rows: TimeEntryRowLike[],
  weeks = 4,
  todayInput?: Date
): Record<string, number[]> {
  const today = todayInput ?? new Date();
  const currentWeek = startOfWeekMonday(today);
  const weekKeys: string[] = [];
  const weekKeyToIndex = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - i * 7);
    const key = weekStartKey(d);
    weekKeyToIndex.set(key, weekKeys.length);
    weekKeys.push(key);
  }

  const result: Record<string, number[]> = {};
  for (const row of rows) {
    const entryWeek = weekStartKey(startOfWeekMonday(new Date(row.date)));
    const idx = weekKeyToIndex.get(entryWeek);
    if (idx === undefined) continue;
    if (!result[row.project_id]) {
      result[row.project_id] = new Array(weeks).fill(0);
    }
    result[row.project_id][idx] += Number(row.hours ?? 0);
  }

  return result;
}

/**
 * Get display label for health status
 */
export function getProjectHealthLabel(status: ProjectHealthStatus): string {
  switch (status) {
    case "not_started":
      return "Not started";
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
    case "not_started":
      return "text-sky-700";
    case "on_track":
      return "text-emerald-700";
    case "at_risk":
      return "text-amber-700";
    case "overrun":
      return "text-red-700";
    case "no_estimate":
      return "text-zinc-600";
    default:
      return "text-zinc-700";
  }
}
