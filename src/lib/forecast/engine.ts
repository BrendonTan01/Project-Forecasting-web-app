import { createAdminClient } from "@/lib/supabase/admin";
import type { ForecastResult } from "@/lib/types";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;

/** Returns the ISO date string (YYYY-MM-DD) for the Monday of the current week. */
function getCurrentWeekMonday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + diff);
  return today;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

type AssignmentWithProject = {
  project_id: string;
  staff_id: string;
  weekly_hours_allocated: number;
  week_start: string | null;
  projects: {
    start_date: string | null;
    end_date: string | null;
    status: string;
  } | null;
};

type RawProjectRelation = {
  start_date: string | null;
  end_date: string | null;
  status: string;
};

type RawAssignmentRow = {
  project_id: string;
  staff_id: string;
  weekly_hours_allocated: number | string | null;
  week_start: string | null;
  projects: RawProjectRelation | RawProjectRelation[] | null;
};

type StaffCapacity = {
  id: string;
  weekly_capacity_hours: number;
};

type AvailabilityRow = {
  staff_id: string;
  week_start: string;
  available_hours: number;
};

function normalizeProjectRelation(
  projects: RawProjectRelation | RawProjectRelation[] | null
): RawProjectRelation | null {
  if (Array.isArray(projects)) {
    return projects[0] ?? null;
  }

  return projects ?? null;
}

/**
 * Runs the forecasting calculation for a tenant, upserts results into
 * forecast_results, and returns the computed rows ordered by week_start.
 */
export async function runForecastForTenant(
  tenantId: string,
  weeks: number = DEFAULT_WEEKS
): Promise<ForecastResult[]> {
  const clampedWeeks = Math.min(Math.max(1, weeks), MAX_WEEKS);
  const admin = createAdminClient();

  const weekMonday = getCurrentWeekMonday();
  const forecastEnd = addDays(weekMonday, clampedWeeks * 7 - 1);

  // Fetch all required data in parallel
  const [
    { data: staffProfiles },
    { data: availabilityRows },
    { data: assignments },
  ] = await Promise.all([
    admin
      .from("staff_profiles")
      .select("id, weekly_capacity_hours")
      .eq("tenant_id", tenantId),

    admin
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", tenantId)
      .gte("week_start", toDateString(weekMonday))
      .lte("week_start", toDateString(forecastEnd)),

    admin
      .from("project_assignments")
      .select("project_id, staff_id, weekly_hours_allocated, week_start, projects(start_date, end_date, status)")
      .eq("tenant_id", tenantId),
  ]);

  const staff: StaffCapacity[] = staffProfiles ?? [];
  const availability: AvailabilityRow[] = (availabilityRows ?? []) as AvailabilityRow[];
  const rawAssignments = (assignments ?? []) as RawAssignmentRow[];
  const allAssignments: AssignmentWithProject[] = rawAssignments.map((row) => ({
    project_id: row.project_id,
    staff_id: row.staff_id,
    weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    week_start: row.week_start ?? null,
    projects: normalizeProjectRelation(row.projects),
  }));

  // Build a lookup: staff_id -> week_start_string -> available_hours
  const availMap = new Map<string, Map<string, number>>();
  for (const row of availability) {
    if (!availMap.has(row.staff_id)) {
      availMap.set(row.staff_id, new Map());
    }
    availMap.get(row.staff_id)!.set(row.week_start, row.available_hours);
  }

  // Filter to only active project assignments
  const activeAssignments = allAssignments.filter(
    (a) => a.projects?.status === "active"
  );

  // Week-specific rows override recurring rows for the same staff+project+week.
  const weeklyOverrideKeys = new Set<string>();
  for (const assignment of activeAssignments) {
    if (assignment.week_start !== null) {
      weeklyOverrideKeys.add(
        `${assignment.staff_id}::${assignment.project_id}::${assignment.week_start}`
      );
    }
  }

  const results: ForecastResult[] = [];

  for (let i = 0; i < clampedWeeks; i++) {
    const weekStart = addDays(weekMonday, i * 7);
    const weekEnd = addDays(weekStart, 6);
    const weekStartStr = toDateString(weekStart);
    const weekEndStr = toDateString(weekEnd);

    // total_capacity: sum available hours per staff for this week.
    // Use staff_availability override if present, otherwise fall back to weekly_capacity_hours.
    let totalCapacity = 0;
    for (const member of staff) {
      const override = availMap.get(member.id)?.get(weekStartStr);
      totalCapacity += override !== undefined ? override : member.weekly_capacity_hours;
    }

    // total_project_hours: sum allocated hours for assignments that apply to
    // this week. An assignment applies if:
    //   - It has a week_start set and it matches this week exactly, OR
    //   - It has no week_start and the project date range overlaps this week
    //     (projects with no dates are included every week).
    let totalProjectHours = 0;
    for (const assignment of activeAssignments) {
      if (assignment.week_start !== null) {
        // Pinned to a specific week
        if (assignment.week_start === weekStartStr) {
          totalProjectHours += assignment.weekly_hours_allocated;
        }
        continue;
      }

      const overrideKey = `${assignment.staff_id}::${assignment.project_id}::${weekStartStr}`;
      if (weeklyOverrideKeys.has(overrideKey)) {
        continue;
      }

      const project = assignment.projects;
      const projectStart = project?.start_date ?? null;
      const projectEnd = project?.end_date ?? null;

      const startsBeforeWeekEnds = projectStart === null || projectStart <= weekEndStr;
      const endsAfterWeekStarts = projectEnd === null || projectEnd >= weekStartStr;

      if (startsBeforeWeekEnds && endsAfterWeekStarts) {
        totalProjectHours += assignment.weekly_hours_allocated;
      }
    }

    const utilizationRate =
      totalCapacity > 0 ? totalProjectHours / totalCapacity : 0;
    const staffingGap = Math.max(0, totalProjectHours - totalCapacity);

    results.push({
      id: "", // populated after upsert
      tenant_id: tenantId,
      week_start: weekStartStr,
      total_capacity: Math.round(totalCapacity * 100) / 100,
      total_project_hours: Math.round(totalProjectHours * 100) / 100,
      utilization_rate: Math.round(utilizationRate * 1000) / 1000,
      staffing_gap: Math.round(staffingGap * 100) / 100,
    });
  }

  // Upsert all weeks in one batch
  const upsertRows = results.map((r) => ({
    tenant_id: r.tenant_id,
    week_start: r.week_start,
    total_capacity: r.total_capacity,
    total_project_hours: r.total_project_hours,
    utilization_rate: r.utilization_rate,
    staffing_gap: r.staffing_gap,
  }));

  const { data: upserted, error } = await admin
    .from("forecast_results")
    .upsert(upsertRows, { onConflict: "tenant_id,week_start" })
    .select("id, tenant_id, week_start, total_capacity, total_project_hours, utilization_rate, staffing_gap, created_at");

  if (error) {
    throw new Error(`Forecast upsert failed: ${error.message}`);
  }

  return (upserted ?? results) as ForecastResult[];
}

/**
 * Fire-and-forget wrapper. Triggers a forecast recalculation in the background
 * without blocking the calling server action. Errors are swallowed silently.
 */
export function scheduleForecastRecalculation(tenantId: string): void {
  runForecastForTenant(tenantId).catch(() => {
    // Intentionally silent — forecast is best-effort and must not break mutations
  });
}
