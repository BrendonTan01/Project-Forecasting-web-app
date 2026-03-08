import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type CellProject = {
  id: string;
  name: string;
  client: string;
  allocatedHours: number;
  staffCount: number;
};

export type CellStaff = {
  id: string;
  name: string;
  jobTitle: string;
  allocatedHours: number;
  capacityHours: number;
};

export type CellDetailResponse = {
  officeName: string;
  weekStart: string;
  projects: CellProject[];
  staff: CellStaff[];
  totalCapacity: number;
  totalAllocated: number;
  remainingCapacity: number;
};

type RawProject = {
  id: string;
  name: string;
  client_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
};

type RawAssignment = {
  id: string;
  staff_id: string;
  weekly_hours_allocated: number | string | null;
  week_start: string | null;
  projects: RawProject | RawProject[] | null;
};

function normalizeProject(p: RawProject | RawProject[] | null): RawProject | null {
  return Array.isArray(p) ? (p[0] ?? null) : p ?? null;
}

function projectOverlapsWeek(
  projectStart: string | null,
  projectEnd: string | null,
  weekStart: string,
  weekEnd: string
): boolean {
  const startsBeforeWeekEnds = projectStart === null || projectStart <= weekEnd;
  const endsAfterWeekStarts = projectEnd === null || projectEnd >= weekStart;
  return startsBeforeWeekEnds && endsAfterWeekStarts;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "financials:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const officeId = searchParams.get("officeId");
  const weekStart = searchParams.get("weekStart");

  if (!officeId || !weekStart) {
    return NextResponse.json(
      { error: "officeId and weekStart query params are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const weekEnd = toDateString(addDays(new Date(`${weekStart}T00:00:00Z`), 6));

  const [
    { data: officeRow, error: officeErr },
    { data: officeUsers, error: officeUsersErr },
    { data: assignmentRows, error: assignErr },
    { data: availRows, error: availErr },
  ] = await Promise.all([
    admin
      .from("offices")
      .select("id, name")
      .eq("id", officeId)
      .eq("tenant_id", user.tenantId)
      .single(),

    admin
      .from("users")
      .select("id")
      .eq("tenant_id", user.tenantId)
      .eq("office_id", officeId),

    admin
      .from("project_assignments")
      .select(
        "id, staff_id, weekly_hours_allocated, week_start, projects(id, name, client_name, start_date, end_date, status)"
      )
      .eq("tenant_id", user.tenantId),

    admin
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", user.tenantId)
      .eq("week_start", weekStart),
  ]);

  if (officeErr || !officeRow) {
    return NextResponse.json({ error: "Office not found" }, { status: 404 });
  }
  if (officeUsersErr) return NextResponse.json({ error: officeUsersErr.message }, { status: 500 });

  const officeUserIds = (officeUsers ?? []).map((u) => u.id);

  const { data: resolvedStaffRows, error: resolvedStaffErr } = officeUserIds.length
    ? await admin
        .from("staff_profiles")
        .select("id, user_id, name, job_title, weekly_capacity_hours")
        .eq("tenant_id", user.tenantId)
        .in("user_id", officeUserIds)
    : { data: [], error: null as { message: string } | null };

  if (resolvedStaffErr) return NextResponse.json({ error: resolvedStaffErr.message }, { status: 500 });
  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

  const availabilityTableMissing =
    availErr &&
    /staff_availability/i.test(availErr.message) &&
    /does not exist|relation/i.test(availErr.message);
  if (availErr && !availabilityTableMissing) {
    return NextResponse.json({ error: availErr.message }, { status: 500 });
  }
  const safeAvailRows = availabilityTableMissing ? [] : (availRows ?? []);

  const officeStaffIds = new Set((resolvedStaffRows ?? []).map((s) => s.id));

  // Availability lookup: staff_id → available_hours for this week
  const availLookup = new Map<string, number>();
  for (const row of safeAvailRows) {
    if (officeStaffIds.has(row.staff_id)) {
      availLookup.set(row.staff_id, Number(row.available_hours));
    }
  }

  // Normalize all assignments
  const allAssignments = ((assignmentRows ?? []) as RawAssignment[]).map((row) => ({
    id: row.id,
    staff_id: row.staff_id,
    weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    week_start: row.week_start ?? null,
    project: normalizeProject(row.projects),
  }));

  const activeAssignments = allAssignments.filter((a) => a.project?.status === "active");

  // Track week-pinned overrides
  const weeklyOverrideKeys = new Set<string>();
  for (const a of activeAssignments) {
    if (a.week_start !== null && a.project?.id) {
      weeklyOverrideKeys.add(`${a.staff_id}::${a.project.id}::${a.week_start}`);
    }
  }

  // Determine which assignments are effective for this week for this office's staff
  type EffectiveAssignment = {
    staff_id: string;
    project: RawProject;
    weekly_hours_allocated: number;
  };

  const effectiveForWeek: EffectiveAssignment[] = [];

  for (const a of activeAssignments) {
    if (!officeStaffIds.has(a.staff_id)) continue;
    if (!a.project) continue;

    let includesThisWeek: boolean;

    if (a.week_start !== null) {
      includesThisWeek = a.week_start === weekStart;
    } else {
      const overrideKey = `${a.staff_id}::${a.project.id}::${weekStart}`;
      if (weeklyOverrideKeys.has(overrideKey)) continue;
      includesThisWeek = projectOverlapsWeek(
        a.project.start_date ?? null,
        a.project.end_date ?? null,
        weekStart,
        weekEnd
      );
    }

    if (includesThisWeek && a.weekly_hours_allocated > 0) {
      effectiveForWeek.push({
        staff_id: a.staff_id,
        project: a.project,
        weekly_hours_allocated: a.weekly_hours_allocated,
      });
    }
  }

  // Aggregate per-project: total allocated hours + unique staff count
  const projectMap = new Map<
    string,
    { project: RawProject; allocatedHours: number; staffIds: Set<string> }
  >();
  for (const ea of effectiveForWeek) {
    if (!projectMap.has(ea.project.id)) {
      projectMap.set(ea.project.id, {
        project: ea.project,
        allocatedHours: 0,
        staffIds: new Set(),
      });
    }
    const entry = projectMap.get(ea.project.id)!;
    entry.allocatedHours += ea.weekly_hours_allocated;
    entry.staffIds.add(ea.staff_id);
  }

  const projects: CellProject[] = Array.from(projectMap.values())
    .sort((a, b) => b.allocatedHours - a.allocatedHours)
    .map(({ project, allocatedHours, staffIds }) => ({
      id: project.id,
      name: project.name,
      client: project.client_name ?? "—",
      allocatedHours: Math.round(allocatedHours * 100) / 100,
      staffCount: staffIds.size,
    }));

  // Aggregate per-staff: allocated hours and capacity for this week
  const staffAllocMap = new Map<string, number>();
  for (const ea of effectiveForWeek) {
    staffAllocMap.set(ea.staff_id, (staffAllocMap.get(ea.staff_id) ?? 0) + ea.weekly_hours_allocated);
  }

  const staff: CellStaff[] = (resolvedStaffRows ?? []).map((s) => {
    const allocatedHours = Math.round((staffAllocMap.get(s.id) ?? 0) * 100) / 100;
    const capacityHours = availLookup.get(s.id) ?? Number(s.weekly_capacity_hours);
    return {
      id: s.id,
      name: s.name ?? "Unknown",
      jobTitle: s.job_title ?? "",
      allocatedHours,
      capacityHours: Math.round(capacityHours * 100) / 100,
    };
  });

  const totalCapacity = staff.reduce((sum, s) => sum + s.capacityHours, 0);
  const totalAllocated = staff.reduce((sum, s) => sum + s.allocatedHours, 0);
  const remainingCapacity = Math.round((totalCapacity - totalAllocated) * 100) / 100;

  const response: CellDetailResponse = {
    officeName: officeRow.name,
    weekStart,
    projects,
    staff,
    totalCapacity: Math.round(totalCapacity * 100) / 100,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    remainingCapacity,
  };

  return NextResponse.json(response);
}
