import { NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const WEEKS = 12;

function getCurrentWeekMonday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + diff);
  return today;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type AssignmentCell = {
  id: string;
  project_id: string;
  project_name: string;
  weekly_hours_allocated: number;
};

export type WeekCell = {
  assigned_hours: number;
  capacity_hours: number;
  utilization: number;
  status: "available" | "full" | "overbooked";
  assignments: AssignmentCell[];
};

export type StaffPlannerRow = {
  id: string;
  name: string;
  job_title: string;
  weekly_capacity_hours: number;
  weeks: Record<string, WeekCell>;
};

export type CapacityPlannerResponse = {
  weeks: string[];
  staff: StaffPlannerRow[];
};

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "assignments:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const weekMonday = getCurrentWeekMonday();

  // Build the list of 12 week-start ISO strings
  const weekStarts: string[] = [];
  for (let i = 0; i < WEEKS; i++) {
    weekStarts.push(toDateString(addDays(weekMonday, i * 7)));
  }

  const forecastEnd = toDateString(addDays(weekMonday, WEEKS * 7 - 1));

  // Parallel fetch: staff profiles, assignments with project info, staff availability
  const [
    { data: staffRows, error: staffErr },
    { data: assignmentRows, error: assignErr },
    { data: availRows, error: availErr },
  ] = await Promise.all([
    admin
      .from("staff_profiles")
      .select("id, name, job_title, weekly_capacity_hours")
      .eq("tenant_id", user.tenantId)
      .order("name"),

    admin
      .from("project_assignments")
      .select(
        "id, staff_id, weekly_hours_allocated, week_start, projects(id, name, start_date, end_date, status)"
      )
      .eq("tenant_id", user.tenantId),

    admin
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", user.tenantId)
      .gte("week_start", weekStarts[0])
      .lte("week_start", forecastEnd),
  ]);

  if (staffErr) {
    return NextResponse.json({ error: staffErr.message }, { status: 500 });
  }
  if (assignErr) {
    return NextResponse.json({ error: assignErr.message }, { status: 500 });
  }
  if (availErr) {
    return NextResponse.json({ error: availErr.message }, { status: 500 });
  }

  // Build staff_availability lookup: staff_id → week_start → available_hours
  const availMap = new Map<string, Map<string, number>>();
  for (const row of availRows ?? []) {
    if (!availMap.has(row.staff_id)) {
      availMap.set(row.staff_id, new Map());
    }
    availMap.get(row.staff_id)!.set(row.week_start, Number(row.available_hours));
  }

  // Normalize the project join (Supabase can return object or array)
  type RawProject = {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
  };

  type RawAssignment = {
    id: string;
    staff_id: string;
    weekly_hours_allocated: number | string | null;
    week_start: string | null;
    projects: RawProject | RawProject[] | null;
  };

  const normalizeProject = (p: RawProject | RawProject[] | null): RawProject | null =>
    Array.isArray(p) ? (p[0] ?? null) : p ?? null;

  const allAssignments = ((assignmentRows ?? []) as RawAssignment[]).map((row) => ({
    id: row.id,
    staff_id: row.staff_id,
    weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    week_start: row.week_start ?? null,
    project: normalizeProject(row.projects),
  }));

  // Only include assignments for active projects
  const activeAssignments = allAssignments.filter(
    (a) => a.project?.status === "active"
  );

  // When a week-specific row exists for the same staff+project+week, it
  // overrides the recurring (week_start=null) row for that week.
  const weeklyOverrideKeys = new Set<string>();
  for (const a of activeAssignments) {
    if (a.week_start !== null && a.project?.id) {
      weeklyOverrideKeys.add(`${a.staff_id}::${a.project.id}::${a.week_start}`);
    }
  }

  // Build a lookup: staff_id → assignment[]
  const assignmentsByStaff = new Map<string, typeof activeAssignments>();
  for (const a of activeAssignments) {
    if (!assignmentsByStaff.has(a.staff_id)) {
      assignmentsByStaff.set(a.staff_id, []);
    }
    assignmentsByStaff.get(a.staff_id)!.push(a);
  }

  // Compute the per-staff per-week grid
  const staffPlannerRows: StaffPlannerRow[] = (staffRows ?? []).map((staff) => {
    const staffAssignments = assignmentsByStaff.get(staff.id) ?? [];
    const weekMap: Record<string, WeekCell> = {};

    for (const weekStart of weekStarts) {
      const weekEnd = toDateString(addDays(new Date(weekStart), 6));
      const capacityHours =
        availMap.get(staff.id)?.get(weekStart) ?? Number(staff.weekly_capacity_hours);

      const matchingAssignments: AssignmentCell[] = [];
      let assignedHours = 0;

      for (const a of staffAssignments) {
        let includesThisWeek: boolean;

        if (a.week_start !== null) {
          // Pinned to a specific week
          includesThisWeek = a.week_start === weekStart;
        } else {
          // If there is a week-specific override for this staff+project+week,
          // skip the recurring row for this week.
          const overrideKey = `${a.staff_id}::${a.project?.id ?? ""}::${weekStart}`;
          if (weeklyOverrideKeys.has(overrideKey)) {
            includesThisWeek = false;
            continue;
          }

          // Floating — applies whenever the project's date range covers this week
          const projectStart = a.project?.start_date ?? null;
          const projectEnd = a.project?.end_date ?? null;
          const startsBeforeWeekEnds = projectStart === null || projectStart <= weekEnd;
          const endsAfterWeekStarts = projectEnd === null || projectEnd >= weekStart;
          includesThisWeek = startsBeforeWeekEnds && endsAfterWeekStarts;
        }

        if (includesThisWeek) {
          assignedHours += a.weekly_hours_allocated;
          if (a.weekly_hours_allocated > 0) {
            matchingAssignments.push({
              id: a.id,
              project_id: a.project?.id ?? "",
              project_name: a.project?.name ?? "Unknown",
              weekly_hours_allocated: a.weekly_hours_allocated,
            });
          }
        }
      }

      const utilization = capacityHours > 0 ? assignedHours / capacityHours : 0;
      const status: WeekCell["status"] =
        utilization > 1 ? "overbooked" : utilization >= 0.8 ? "full" : "available";

      weekMap[weekStart] = {
        assigned_hours: Math.round(assignedHours * 100) / 100,
        capacity_hours: Math.round(capacityHours * 100) / 100,
        utilization: Math.round(utilization * 1000) / 1000,
        status,
        assignments: matchingAssignments,
      };
    }

    return {
      id: staff.id,
      name: staff.name ?? "Unknown",
      job_title: staff.job_title ?? "",
      weekly_capacity_hours: Number(staff.weekly_capacity_hours),
      weeks: weekMap,
    };
  });

  const response: CapacityPlannerResponse = {
    weeks: weekStarts,
    staff: staffPlannerRows,
  };

  return NextResponse.json(response);
}
