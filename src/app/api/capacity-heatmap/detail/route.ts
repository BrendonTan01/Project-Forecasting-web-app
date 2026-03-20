import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterEffectiveAssignmentsForWeek } from "@/lib/utils/assignmentEffective";
import { addUtcDays, toDateString } from "@/lib/utils/week";

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
  leaveImpactHours?: number;
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canViewCapacity =
    hasPermission(user.role, "financials:view") ||
    hasPermission(user.role, "assignments:manage");
  if (!canViewCapacity) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const officeId = searchParams.get("officeId");
  const weekStart = searchParams.get("weekStart");
  const skillId = searchParams.get("skillId")?.trim() ?? "";

  if (!officeId || !weekStart) {
    return NextResponse.json(
      { error: "officeId and weekStart query params are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const weekEnd = toDateString(addUtcDays(new Date(`${weekStart}T00:00:00Z`), 6));

  const [
    { data: officeRow, error: officeErr },
    { data: officeUsers, error: officeUsersErr },
    { data: staffSkillRows, error: staffSkillErr },
    { data: assignmentRows, error: assignErr },
    { data: availRows, error: availErr },
    { data: leaveRows },
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

    skillId
      ? admin
          .from("staff_skills")
          .select("staff_id")
          .eq("tenant_id", user.tenantId)
          .eq("skill_id", skillId)
      : Promise.resolve({
          data: [] as Array<{ staff_id: string }>,
          error: null as { message: string } | null,
        }),

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

    admin
      .from("leave_requests")
      .select("staff_id, start_date, end_date")
      .eq("tenant_id", user.tenantId)
      .eq("status", "approved"),
  ]);

  if (officeErr || !officeRow) {
    return NextResponse.json({ error: "Office not found" }, { status: 404 });
  }
  if (officeUsersErr) return NextResponse.json({ error: officeUsersErr.message }, { status: 500 });
  if (staffSkillErr) return NextResponse.json({ error: staffSkillErr.message }, { status: 500 });

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

  const allowedStaffIdsBySkill =
    skillId.length > 0
      ? new Set((staffSkillRows ?? []).map((row) => row.staff_id))
      : null;
  const officeStaffIds = new Set(
    (resolvedStaffRows ?? [])
      .map((s) => s.id)
      .filter((staffId) => !allowedStaffIdsBySkill || allowedStaffIdsBySkill.has(staffId))
  );

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
    project_id: normalizeProject(row.projects)?.id ?? "",
    staff_id: row.staff_id,
    weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    week_start: row.week_start ?? null,
    projects: normalizeProject(row.projects),
  }));

  const activeAssignments = allAssignments.filter((a) => a.projects?.status === "active");

  // Determine which assignments are effective for this week for this office's staff
  type EffectiveAssignment = {
    staff_id: string;
    project: RawProject;
    weekly_hours_allocated: number;
  };

  const effectiveForWeek: EffectiveAssignment[] = filterEffectiveAssignmentsForWeek(
    activeAssignments,
    weekStart
  )
    .filter((a) => officeStaffIds.has(a.staff_id) && a.projects && a.weekly_hours_allocated > 0)
    .map((a) => ({
      staff_id: a.staff_id,
      project: a.projects!,
      weekly_hours_allocated: a.weekly_hours_allocated,
    }));

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

  const staff: CellStaff[] = (resolvedStaffRows ?? [])
    .filter((s) => officeStaffIds.has(s.id))
    .map((s) => {
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

  // Compute leave impact for office staff overlapping this week (same logic as forecast API)
  type LeaveRow = { staff_id: string; start_date: string; end_date: string };
  let leaveImpactHours = 0;
  const staffCapMap = new Map(
    (resolvedStaffRows ?? []).map((s) => [s.id, availLookup.get(s.id) ?? Number(s.weekly_capacity_hours)])
  );
  for (const leave of (leaveRows ?? []) as LeaveRow[]) {
    if (!officeStaffIds.has(leave.staff_id)) continue;
    const overlapStart = leave.start_date > weekStart ? leave.start_date : weekStart;
    const overlapEnd = leave.end_date < weekEnd ? leave.end_date : weekEnd;
    if (overlapStart > overlapEnd) continue;
    const overlapDays =
      Math.floor(
        (new Date(`${overlapEnd}T00:00:00Z`).getTime() -
          new Date(`${overlapStart}T00:00:00Z`).getTime()) /
          86400000
      ) + 1;
    const weeklyCap = staffCapMap.get(leave.staff_id) ?? 0;
    leaveImpactHours += (Math.min(overlapDays, 5) / 5) * weeklyCap;
  }
  leaveImpactHours = Math.round(leaveImpactHours * 100) / 100;

  const response: CellDetailResponse = {
    officeName: officeRow.name,
    weekStart,
    projects,
    staff,
    totalCapacity: Math.round(totalCapacity * 100) / 100,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    remainingCapacity,
    leaveImpactHours: leaveImpactHours > 0 ? leaveImpactHours : undefined,
  };

  return NextResponse.json(response);
}
