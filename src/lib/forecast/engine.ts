import { createAdminClient } from "@/lib/supabase/admin";
import { filterEffectiveAssignmentsForWeek } from "@/lib/utils/assignmentEffective";
import { addUtcDays, rangesOverlap, startOfCurrentWeekUtc, toDateString } from "@/lib/utils/week";
import type {
  ForecastResult,
  HiringPrediction,
  HiringRecommendation,
  HiringRecommendationType,
  SkillShortage,
} from "@/lib/types";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;
const FALLBACK_WEEKLY_HOURS = 40;

const OVERLOAD_THRESHOLD = 1.0;
const SUSTAINED_OVERLOAD_THRESHOLD = 0.95;
const SUSTAINED_OVERLOAD_WEEKS = 3;
const UNDERUTILIZATION_THRESHOLD = 0.65;
const UNDERUTILIZATION_WEEKS = 4;
const STANDARD_STAFF_CAPACITY = 40;
const DEMAND_EXCESS_THRESHOLD = 1.2;
const CONSECUTIVE_WEEKS_TRIGGER = 4;

function formatMonthYear(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
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
  name?: string | null;
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

type ForecastPredictionInput = Pick<
  ForecastResult,
  "week_start" | "utilization_rate" | "total_capacity" | "total_project_hours"
>;

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

  const weekMonday = startOfCurrentWeekUtc();
  const forecastEnd = addUtcDays(weekMonday, clampedWeeks * 7 - 1);

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

  // Active-only is preserved by shared effective-assignment filtering.
  const activeAssignments = allAssignments.filter((a) => a.projects?.status === "active");

  const results: ForecastResult[] = [];

  for (let i = 0; i < clampedWeeks; i++) {
    const weekStart = addUtcDays(weekMonday, i * 7);
    const weekStartStr = toDateString(weekStart);

    // total_capacity: sum available hours per staff for this week.
    // Use staff_availability override if present, otherwise fall back to weekly_capacity_hours.
    let totalCapacity = 0;
    for (const member of staff) {
      const override = availMap.get(member.id)?.get(weekStartStr);
      totalCapacity += override !== undefined ? override : member.weekly_capacity_hours;
    }

    const totalProjectHours = filterEffectiveAssignmentsForWeek(activeAssignments, weekStartStr).reduce(
      (sum, assignment) => sum + assignment.weekly_hours_allocated,
      0
    );

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

export function deriveHiringPredictionsFromForecast(
  tenantId: string,
  forecastRows: ForecastPredictionInput[],
  averageStaffCapacity: number
): Omit<HiringPrediction, "id" | "created_at">[] {
  const safeAverageStaffCapacity =
    averageStaffCapacity > 0 ? averageStaffCapacity : FALLBACK_WEEKLY_HOURS;
  const orderedRows = [...forecastRows].sort((a, b) => a.week_start.localeCompare(b.week_start));

  return orderedRows.map((row, index) => {
    const utilizationRate = Number(row.utilization_rate ?? 0);
    const totalProjectHours = Number(row.total_project_hours ?? 0);
    const totalCapacity = Number(row.total_capacity ?? 0);

    const isOverload = utilizationRate > OVERLOAD_THRESHOLD;
    const hasThreeWeekHighUtilization =
      index >= SUSTAINED_OVERLOAD_WEEKS - 1 &&
      orderedRows
        .slice(index - (SUSTAINED_OVERLOAD_WEEKS - 1), index + 1)
        .every((week) => Number(week.utilization_rate ?? 0) > SUSTAINED_OVERLOAD_THRESHOLD);
    const hasFourWeekUnderutilization =
      index >= UNDERUTILIZATION_WEEKS - 1 &&
      orderedRows
        .slice(index - (UNDERUTILIZATION_WEEKS - 1), index + 1)
        .every((week) => Number(week.utilization_rate ?? 0) < UNDERUTILIZATION_THRESHOLD);

    const hoursOverCapacity = isOverload ? Math.max(0, totalProjectHours - totalCapacity) : 0;
    let recommendedHires = 0;
    let recommendationType: HiringRecommendationType = "none";
    let message = "No hiring action needed this week.";

    if (isOverload) {
      recommendedHires = Math.ceil(hoursOverCapacity / safeAverageStaffCapacity);
      recommendationType = "overload";
      const consultantLabel = recommendedHires === 1 ? "consultant" : "consultants";
      message = `Team capacity exceeded by ${formatHours(hoursOverCapacity)} hours. Hire ${recommendedHires} ${consultantLabel} before ${formatMonthYear(row.week_start)}.`;
    } else if (hasThreeWeekHighUtilization) {
      recommendedHires = 1;
      recommendationType = "sustained_overload";
      message = "Utilization above 95% for 3 weeks. Consider hiring to prevent overload.";
    } else if (hasFourWeekUnderutilization) {
      recommendationType = "underutilization";
      message = "Team utilization below 65% for 4 weeks. Current staffing may exceed demand.";
    }

    return {
      tenant_id: tenantId,
      week_start: row.week_start,
      utilization_rate: Math.round(utilizationRate * 1000) / 1000,
      hours_over_capacity: Math.round(hoursOverCapacity * 100) / 100,
      recommended_hires: recommendedHires,
      recommendation_type: recommendationType,
      message,
    };
  });
}

/**
 * Runs hiring prediction calculations for a tenant and persists rows into
 * hiring_predictions.
 */
export async function runHiringPredictionsForTenant(
  tenantId: string,
  weeks: number = DEFAULT_WEEKS
): Promise<HiringPrediction[]> {
  const clampedWeeks = Math.min(Math.max(1, weeks), MAX_WEEKS);
  const admin = createAdminClient();

  const [forecastRows, { data: staffProfiles }] = await Promise.all([
    runForecastForTenant(tenantId, clampedWeeks),
    admin
      .from("staff_profiles")
      .select("weekly_capacity_hours")
      .eq("tenant_id", tenantId),
  ]);

  const profiles = staffProfiles ?? [];
  const averageStaffCapacity =
    profiles.length > 0
      ? profiles.reduce((sum, profile) => sum + Number(profile.weekly_capacity_hours ?? 0), 0) /
        profiles.length
      : FALLBACK_WEEKLY_HOURS;
  const upsertRows = deriveHiringPredictionsFromForecast(
    tenantId,
    forecastRows,
    averageStaffCapacity
  );

  const { data: upserted, error } = await admin
    .from("hiring_predictions")
    .upsert(upsertRows, { onConflict: "tenant_id,week_start" })
    .select(
      "id, tenant_id, week_start, utilization_rate, hours_over_capacity, recommended_hires, recommendation_type, message, created_at"
    );

  if (error) {
    throw new Error(`Hiring predictions upsert failed: ${error.message}`);
  }

  return (upserted ?? []) as HiringPrediction[];
}

/**
 * Fire-and-forget wrapper. Triggers hiring insight recalculation in the
 * background without blocking the calling server action.
 */
export function scheduleHiringPredictionsRecalculation(tenantId: string): void {
  runHiringPredictionsForTenant(tenantId).catch(() => {
    // Intentionally silent — hiring predictions are best-effort.
  });
}

// ---------------------------------------------------------------------------
// Skill-based shortage computation
// ---------------------------------------------------------------------------

type SkillRow = { id: string; name: string };

type ProjectSkillRequirementRow = {
  project_id: string;
  skill_id: string;
  required_hours_per_week: number;
  projects: RawProjectRelation | null;
  project_name?: string;
};

type StaffSkillRow = {
  staff_id: string;
  skill_id: string;
  staff_profiles: { id: string; weekly_capacity_hours: number } | null;
};

type RawProjectSkillRequirementRow = {
  project_id: string;
  skill_id: string;
  required_hours_per_week: number | string | null;
  projects: RawProjectRelation | RawProjectRelation[] | null;
};

type RawStaffProfileRelation = {
  id: string;
  weekly_capacity_hours: number | string | null;
};

type RawStaffSkillRow = {
  staff_id: string;
  skill_id: string;
  staff_profiles: RawStaffProfileRelation | RawStaffProfileRelation[] | null;
};

function normalizeStaffProfileRelation(
  staffProfile: RawStaffProfileRelation | RawStaffProfileRelation[] | null
): RawStaffProfileRelation | null {
  if (Array.isArray(staffProfile)) {
    return staffProfile[0] ?? null;
  }

  return staffProfile ?? null;
}

type SkillCapacityMember = { staffId: string; weeklyCapacityHours: number };
type SkillWeekDemandCapacity = {
  weekStart: string;
  weekEnd: string;
  demand: number;
  capacity: number;
};

function projectOverlapsWeek(
  projectStart: string | null,
  projectEnd: string | null,
  weekStart: string,
  weekEnd: string
): boolean {
  const safeStart = projectStart ?? "0000-01-01";
  const safeEnd = projectEnd ?? "9999-12-31";
  return rangesOverlap(safeStart, safeEnd, weekStart, weekEnd);
}

function buildSkillWeeklyDemandCapacityMatrix(
  skills: SkillRow[],
  activeRequirements: ProjectSkillRequirementRow[],
  skillToStaff: Map<string, SkillCapacityMember[]>,
  availMap: Map<string, Map<string, number>>,
  weekMonday: Date,
  weeks: number
): Map<string, SkillWeekDemandCapacity[]> {
  const matrix = new Map<string, SkillWeekDemandCapacity[]>();

  for (const skill of skills) {
    const weeklySeries: SkillWeekDemandCapacity[] = [];
    for (let i = 0; i < weeks; i++) {
      const weekStart = addUtcDays(weekMonday, i * 7);
      const weekStartStr = toDateString(weekStart);
      const weekEndStr = toDateString(addUtcDays(weekStart, 6));

      let demand = 0;
      for (const req of activeRequirements) {
        if (req.skill_id !== skill.id) continue;
        const proj = req.projects;
        if (
          projectOverlapsWeek(
            proj?.start_date ?? null,
            proj?.end_date ?? null,
            weekStartStr,
            weekEndStr
          )
        ) {
          demand += req.required_hours_per_week;
        }
      }

      let capacity = 0;
      for (const { staffId, weeklyCapacityHours } of skillToStaff.get(skill.id) ?? []) {
        const override = availMap.get(staffId)?.get(weekStartStr);
        capacity += override !== undefined ? override : weeklyCapacityHours;
      }

      weeklySeries.push({
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        demand,
        capacity,
      });
    }
    matrix.set(skill.id, weeklySeries);
  }

  return matrix;
}

/**
 * Detects skills that have sustained demand pressure and returns hiring
 * recommendations. A recommendation is triggered when demand exceeds capacity
 * by more than 20% for 4 consecutive weeks.
 */
export async function computeHiringRecommendations(
  tenantId: string,
  weeks: number = DEFAULT_WEEKS
): Promise<HiringRecommendation[]> {
  const clampedWeeks = Math.min(Math.max(1, weeks), MAX_WEEKS);
  const admin = createAdminClient();

  const weekMonday = startOfCurrentWeekUtc();
  const forecastEnd = addUtcDays(weekMonday, clampedWeeks * 7 - 1);
  const weekMondayStr = toDateString(weekMonday);
  const forecastEndStr = toDateString(forecastEnd);

  const [
    { data: skillRows },
    { data: requirementRows },
    { data: staffSkillRows },
    { data: availabilityRows },
  ] = await Promise.all([
    admin
      .from("skills")
      .select("id, name")
      .eq("tenant_id", tenantId),

    admin
      .from("project_skill_requirements")
      .select("project_id, skill_id, required_hours_per_week, projects(name, status, start_date, end_date)")
      .eq("tenant_id", tenantId),

    admin
      .from("staff_skills")
      .select("staff_id, skill_id, staff_profiles(id, weekly_capacity_hours)")
      .eq("tenant_id", tenantId),

    admin
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", tenantId)
      .gte("week_start", weekMondayStr)
      .lte("week_start", forecastEndStr),
  ]);

  const skills = (skillRows ?? []) as SkillRow[];
  const rawRequirements = (requirementRows ?? []) as RawProjectSkillRequirementRow[];
  const requirements: ProjectSkillRequirementRow[] = rawRequirements.map((row) => {
    const proj = normalizeProjectRelation(row.projects);
    return {
      project_id: row.project_id,
      skill_id: row.skill_id,
      required_hours_per_week: Number(row.required_hours_per_week ?? 0),
      projects: proj,
      project_name: proj?.name ?? undefined,
    };
  });
  const rawStaffSkills = (staffSkillRows ?? []) as RawStaffSkillRow[];
  const staffSkills: StaffSkillRow[] = rawStaffSkills.map((row) => {
    const staffProfile = normalizeStaffProfileRelation(row.staff_profiles);
    return {
      staff_id: row.staff_id,
      skill_id: row.skill_id,
      staff_profiles: staffProfile
        ? {
            id: staffProfile.id,
            weekly_capacity_hours: Number(staffProfile.weekly_capacity_hours ?? 0),
          }
        : null,
    };
  });
  const availability = (availabilityRows ?? []) as AvailabilityRow[];

  if (skills.length === 0) {
    return [];
  }

  const availMap = new Map<string, Map<string, number>>();
  for (const row of availability) {
    if (!availMap.has(row.staff_id)) {
      availMap.set(row.staff_id, new Map());
    }
    availMap.get(row.staff_id)!.set(row.week_start, row.available_hours);
  }

  const activeRequirements = requirements.filter((r) => {
    const proj = r.projects;
    return proj?.status === "active";
  });

  const skillToStaff = new Map<string, { staffId: string; weeklyCapacityHours: number }[]>();
  for (const row of staffSkills) {
    const profile = row.staff_profiles;
    if (!profile) continue;
    if (!skillToStaff.has(row.skill_id)) {
      skillToStaff.set(row.skill_id, []);
    }
    skillToStaff.get(row.skill_id)!.push({
      staffId: profile.id,
      weeklyCapacityHours: Number(profile.weekly_capacity_hours ?? 0),
    });
  }

  const skillMatrix = buildSkillWeeklyDemandCapacityMatrix(
    skills,
    activeRequirements,
    skillToStaff,
    availMap,
    weekMonday,
    clampedWeeks
  );

  const recommendations: HiringRecommendation[] = [];

  for (const skill of skills) {
    let consecutiveWeeks = 0;

    for (let i = 0; i < clampedWeeks; i++) {
      const weekEntry = (skillMatrix.get(skill.id) ?? [])[i];
      if (!weekEntry) continue;
      const weekStartStr = weekEntry.weekStart;
      const weekEndStr = weekEntry.weekEnd;
      const weekDemand = weekEntry.demand;
      const weekCapacity = weekEntry.capacity;

      const exceedsThreshold =
        weekDemand > 0 && weekDemand > weekCapacity * DEMAND_EXCESS_THRESHOLD;

      if (exceedsThreshold) {
        consecutiveWeeks += 1;
      } else {
        consecutiveWeeks = 0;
      }

      if (consecutiveWeeks >= CONSECUTIVE_WEEKS_TRIGGER) {
        const demandOverCapacity = Math.max(0, weekDemand - weekCapacity);
        const staffNeeded = Math.max(
          1,
          Math.ceil(demandOverCapacity / STANDARD_STAFF_CAPACITY)
        );
        const breachStartWeekIndex = i - (CONSECUTIVE_WEEKS_TRIGGER - 1);
        const shortageStartWeek = toDateString(addUtcDays(weekMonday, breachStartWeekIndex * 7));

        const demandSources = activeRequirements
          .filter((req) => {
            if (req.skill_id !== skill.id) return false;
            const proj = req.projects;
            const projectStart = proj?.start_date ?? null;
            const projectEnd = proj?.end_date ?? null;
            return projectOverlapsWeek(
              projectStart,
              projectEnd,
              weekStartStr,
              weekEndStr
            );
          })
          .map((req) => ({
            project_name: req.project_name ?? "Unknown Project",
            hours_per_week: req.required_hours_per_week,
          }));

        recommendations.push({
          skill: skill.name,
          staff_needed: staffNeeded,
          recommended_hiring_window_weeks: Math.max(1, breachStartWeekIndex),
          shortage_start_week: shortageStartWeek,
          demand_sources: demandSources,
        });
        break;
      }
    }
  }

  return recommendations;
}

/**
 * Computes per-skill staffing shortages averaged across the forecast window.
 *
 * For each skill:
 *   - weekly_demand: average weekly hours required by active projects that have
 *     this skill requirement and whose date range overlaps the week.
 *   - available_capacity: average weekly hours available from staff who hold
 *     this skill (respecting staff_availability overrides).
 *   - shortage: max(0, weekly_demand - available_capacity)
 *
 * Only skills with non-zero demand or a shortage are returned.
 */
export async function computeSkillShortages(
  tenantId: string,
  weeks: number = DEFAULT_WEEKS
): Promise<SkillShortage[]> {
  const clampedWeeks = Math.min(Math.max(1, weeks), MAX_WEEKS);
  const admin = createAdminClient();

  const weekMonday = startOfCurrentWeekUtc();
  const forecastEnd = addUtcDays(weekMonday, clampedWeeks * 7 - 1);
  const weekMondayStr = toDateString(weekMonday);
  const forecastEndStr = toDateString(forecastEnd);

  const [
    { data: skillRows },
    { data: requirementRows },
    { data: staffSkillRows },
    { data: availabilityRows },
  ] = await Promise.all([
    admin
      .from("skills")
      .select("id, name")
      .eq("tenant_id", tenantId),

    admin
      .from("project_skill_requirements")
      .select("project_id, skill_id, required_hours_per_week, projects(status, start_date, end_date)")
      .eq("tenant_id", tenantId),

    admin
      .from("staff_skills")
      .select("staff_id, skill_id, staff_profiles(id, weekly_capacity_hours)")
      .eq("tenant_id", tenantId),

    admin
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", tenantId)
      .gte("week_start", weekMondayStr)
      .lte("week_start", forecastEndStr),
  ]);

  const skills = (skillRows ?? []) as SkillRow[];
  const rawRequirements = (requirementRows ?? []) as RawProjectSkillRequirementRow[];
  const requirements: ProjectSkillRequirementRow[] = rawRequirements.map((row) => ({
    project_id: row.project_id,
    skill_id: row.skill_id,
    required_hours_per_week: Number(row.required_hours_per_week ?? 0),
    projects: normalizeProjectRelation(row.projects),
  }));
  const rawStaffSkills = (staffSkillRows ?? []) as RawStaffSkillRow[];
  const staffSkills: StaffSkillRow[] = rawStaffSkills.map((row) => {
    const staffProfile = normalizeStaffProfileRelation(row.staff_profiles);
    return {
      staff_id: row.staff_id,
      skill_id: row.skill_id,
      staff_profiles: staffProfile
        ? {
            id: staffProfile.id,
            weekly_capacity_hours: Number(staffProfile.weekly_capacity_hours ?? 0),
          }
        : null,
    };
  });
  const availability = (availabilityRows ?? []) as AvailabilityRow[];

  if (skills.length === 0) {
    return [];
  }

  // Build availability map: staff_id -> week_start -> available_hours
  const availMap = new Map<string, Map<string, number>>();
  for (const row of availability) {
    if (!availMap.has(row.staff_id)) {
      availMap.set(row.staff_id, new Map());
    }
    availMap.get(row.staff_id)!.set(row.week_start, row.available_hours);
  }

  // Build skill-to-requirements index (active projects only)
  const activeRequirements = requirements.filter((r) => {
    const proj = r.projects;
    return proj?.status === "active";
  });

  // Build skill-to-staffProfiles index: skill_id -> [{staffId, weeklyCapacityHours}]
  const skillToStaff = new Map<string, { staffId: string; weeklyCapacityHours: number }[]>();
  for (const row of staffSkills) {
    const profile = row.staff_profiles;
    if (!profile) continue;
    if (!skillToStaff.has(row.skill_id)) {
      skillToStaff.set(row.skill_id, []);
    }
    skillToStaff.get(row.skill_id)!.push({
      staffId: profile.id,
      weeklyCapacityHours: Number(profile.weekly_capacity_hours ?? 0),
    });
  }

  const skillMatrix = buildSkillWeeklyDemandCapacityMatrix(
    skills,
    activeRequirements,
    skillToStaff,
    availMap,
    weekMonday,
    clampedWeeks
  );

  // Build result: average per week, include only skills with demand or shortage
  const result: SkillShortage[] = [];
  for (const skill of skills) {
    const weekEntries = skillMatrix.get(skill.id) ?? [];
    const demandTotal = weekEntries.reduce((sum, entry) => sum + entry.demand, 0);
    const capacityTotal = weekEntries.reduce((sum, entry) => sum + entry.capacity, 0);
    const avgDemand = Math.round((demandTotal / clampedWeeks) * 100) / 100;
    const avgCapacity = Math.round((capacityTotal / clampedWeeks) * 100) / 100;
    const shortage = Math.round(Math.max(0, avgDemand - avgCapacity) * 100) / 100;

    if (avgDemand > 0 || shortage > 0) {
      result.push({
        skill: skill.name,
        weekly_demand: avgDemand,
        available_capacity: avgCapacity,
        shortage,
      });
    }
  }

  return result;
}
