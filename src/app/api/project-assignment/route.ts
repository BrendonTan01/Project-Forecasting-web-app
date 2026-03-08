import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleForecastRecalculation } from "@/lib/forecast/engine";

type MoveScope = "single" | "future" | "all";

type PatchBody = {
  assignment_id: string;
  staff_id?: string;
  week_start?: string | null;
  source_week_start?: string;
  move_scope?: MoveScope;
  weekly_hours_allocated?: number;
};

type ProjectAssignmentRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  staff_id: string;
  allocation_percentage: number;
  weekly_hours_allocated: number;
  week_start: string | null;
  projects:
    | {
        start_date: string | null;
        end_date: string | null;
      }
    | {
        start_date: string | null;
        end_date: string | null;
      }[]
    | null;
};

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeToMonday(dateString: string): Date {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeProjectDateRelation(
  relation:
    | { start_date: string | null; end_date: string | null }
    | { start_date: string | null; end_date: string | null }[]
    | null
): { start_date: string | null; end_date: string | null } | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation ?? null;
}

function buildWeekSeries(options: {
  projectStart: string | null;
  projectEnd: string | null;
  sourceWeekStart: string;
  scope: MoveScope;
}): string[] {
  const sourceWeek = normalizeToMonday(options.sourceWeekStart);

  // If project dates are missing, use a bounded fallback window around source week.
  const fallbackStart = addDays(sourceWeek, -52 * 7);
  const fallbackEnd = addDays(sourceWeek, 52 * 7);
  const rangeStart = normalizeToMonday(options.projectStart ?? toDateString(fallbackStart));
  const rangeEnd = normalizeToMonday(options.projectEnd ?? toDateString(fallbackEnd));

  const weeks: string[] = [];
  for (
    let cursor = new Date(rangeStart);
    cursor <= rangeEnd;
    cursor = addDays(cursor, 7)
  ) {
    const current = toDateString(cursor);
    if (options.scope === "single" && current !== options.sourceWeekStart) {
      continue;
    }
    if (options.scope === "future" && current < options.sourceWeekStart) {
      continue;
    }
    weeks.push(current);
  }

  return weeks;
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "assignments:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    assignment_id,
    staff_id,
    week_start,
    source_week_start,
    move_scope = "single",
    weekly_hours_allocated,
  } = body;

  if (!assignment_id) {
    return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
  }

  // Validate that at least one field is being updated
  if (
    staff_id === undefined &&
    week_start === undefined &&
    weekly_hours_allocated === undefined
  ) {
    return NextResponse.json(
      { error: "At least one of staff_id, week_start, or weekly_hours_allocated must be provided" },
      { status: 400 }
    );
  }

  if (!["single", "future", "all"].includes(move_scope)) {
    return NextResponse.json(
      { error: "move_scope must be one of: single, future, all" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify the assignment belongs to this tenant before updating
  const { data: existing, error: fetchErr } = await admin
    .from("project_assignments")
    .select(
      "id, tenant_id, project_id, staff_id, allocation_percentage, weekly_hours_allocated, week_start, projects(start_date, end_date)"
    )
    .eq("id", assignment_id)
    .eq("tenant_id", user.tenantId)
    .single<ProjectAssignmentRow>();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  if (weekly_hours_allocated !== undefined && weekly_hours_allocated < 0) {
    return NextResponse.json(
      { error: "weekly_hours_allocated must be >= 0" },
      { status: 400 }
    );
  }

  const targetStaffId = staff_id ?? existing.staff_id;
  const targetWeekStart = week_start ?? existing.week_start ?? source_week_start ?? null;
  const sourceWeekStart = source_week_start ?? existing.week_start ?? week_start ?? null;
  const effectiveWeeklyHours = weekly_hours_allocated ?? existing.weekly_hours_allocated;
  const projectDates = normalizeProjectDateRelation(existing.projects);

  if (move_scope !== "all" && (!sourceWeekStart || !targetWeekStart)) {
    return NextResponse.json(
      { error: "source_week_start and week_start are required for single/future moves" },
      { status: 400 }
    );
  }

  // Move all assignments: keep recurrence if currently recurring.
  if (move_scope === "all") {
    const updatePayload: Record<string, unknown> = {
      staff_id: targetStaffId,
    };
    if (existing.week_start !== null && targetWeekStart !== null) {
      updatePayload.week_start = targetWeekStart;
    }
    if (weekly_hours_allocated !== undefined) {
      updatePayload.weekly_hours_allocated = effectiveWeeklyHours;
    }

    const { data: updated, error: updateErr } = await admin
      .from("project_assignments")
      .update(updatePayload)
      .eq("id", assignment_id)
      .eq("tenant_id", user.tenantId)
      .select("id, staff_id, project_id, weekly_hours_allocated, week_start, allocation_percentage")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    scheduleForecastRecalculation(user.tenantId);
    return NextResponse.json({ assignment: updated });
  }

  const fromWeek = normalizeToMonday(sourceWeekStart!);
  const toWeek = normalizeToMonday(targetWeekStart!);
  const weekShiftDays = Math.round((toWeek.getTime() - fromWeek.getTime()) / (1000 * 60 * 60 * 24));

  // Recurring assignment: create week-specific override rows.
  if (existing.week_start === null) {
    const sourceWeeks = buildWeekSeries({
      projectStart: projectDates?.start_date ?? null,
      projectEnd: projectDates?.end_date ?? null,
      sourceWeekStart: sourceWeekStart!,
      scope: move_scope,
    });

    if (sourceWeeks.length === 0) {
      return NextResponse.json(
        { error: "No matching weeks found for this move" },
        { status: 400 }
      );
    }

    const targetRows = sourceWeeks.map((week) => ({
      tenant_id: user.tenantId,
      project_id: existing.project_id,
      staff_id: targetStaffId,
      allocation_percentage: existing.allocation_percentage,
      weekly_hours_allocated: effectiveWeeklyHours,
      week_start: toDateString(addDays(normalizeToMonday(week), weekShiftDays)),
    }));

    // Source blockers suppress this recurring assignment on moved weeks.
    const sourceBlockerRows = sourceWeeks.map((week) => ({
      tenant_id: user.tenantId,
      project_id: existing.project_id,
      staff_id: existing.staff_id,
      allocation_percentage: existing.allocation_percentage,
      weekly_hours_allocated: 0,
      week_start: week,
    }));

    const { error: upsertTargetErr } = await admin
      .from("project_assignments")
      .upsert(targetRows, { onConflict: "project_id,staff_id,week_start" });
    if (upsertTargetErr) {
      return NextResponse.json({ error: upsertTargetErr.message }, { status: 500 });
    }

    const { error: upsertSourceErr } = await admin
      .from("project_assignments")
      .upsert(sourceBlockerRows, { onConflict: "project_id,staff_id,week_start" });
    if (upsertSourceErr) {
      return NextResponse.json({ error: upsertSourceErr.message }, { status: 500 });
    }

    scheduleForecastRecalculation(user.tenantId);
    return NextResponse.json({
      assignment: {
        id: existing.id,
        staff_id: targetStaffId,
        project_id: existing.project_id,
        weekly_hours_allocated: effectiveWeeklyHours,
        week_start: targetWeekStart,
        allocation_percentage: existing.allocation_percentage,
      },
    });
  }

  // Week-specific assignment: move the selected row (or series of pinned rows).
  if (move_scope === "single") {
    const { data: updated, error: updateErr } = await admin
      .from("project_assignments")
      .update({
        staff_id: targetStaffId,
        week_start: targetWeekStart,
        weekly_hours_allocated: effectiveWeeklyHours,
      })
      .eq("id", assignment_id)
      .eq("tenant_id", user.tenantId)
      .select("id, staff_id, project_id, weekly_hours_allocated, week_start, allocation_percentage")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    scheduleForecastRecalculation(user.tenantId);
    return NextResponse.json({ assignment: updated });
  }

  const { data: relatedRows, error: relatedErr } = await admin
    .from("project_assignments")
    .select("id, week_start")
    .eq("tenant_id", user.tenantId)
    .eq("project_id", existing.project_id)
    .eq("staff_id", existing.staff_id)
    .eq("weekly_hours_allocated", existing.weekly_hours_allocated)
    .not("week_start", "is", null);

  if (relatedErr) {
    return NextResponse.json({ error: relatedErr.message }, { status: 500 });
  }

  const selectedRows = (relatedRows ?? []).filter((row) => {
    if (!row.week_start) return false;
    if (move_scope === "future") return row.week_start >= sourceWeekStart!;
    return true;
  });

  if (selectedRows.length === 0) {
    return NextResponse.json(
      { error: "No matching week-specific rows found for this move scope" },
      { status: 400 }
    );
  }

  const transformedRows = selectedRows.map((row) => ({
    id: row.id,
    week_start: toDateString(addDays(normalizeToMonday(row.week_start!), weekShiftDays)),
    staff_id: targetStaffId,
  }));

  for (const row of transformedRows) {
    const { error: moveErr } = await admin
      .from("project_assignments")
      .update({
        staff_id: row.staff_id,
        week_start: row.week_start,
        weekly_hours_allocated: effectiveWeeklyHours,
      })
      .eq("id", row.id)
      .eq("tenant_id", user.tenantId);

    if (moveErr) {
      return NextResponse.json({ error: moveErr.message }, { status: 500 });
    }
  }

  // Fire-and-forget forecast recalculation
  scheduleForecastRecalculation(user.tenantId);

  return NextResponse.json({
    assignment: {
      id: existing.id,
      staff_id: targetStaffId,
      project_id: existing.project_id,
      weekly_hours_allocated: effectiveWeeklyHours,
      week_start: targetWeekStart,
      allocation_percentage: existing.allocation_percentage,
    },
  });
}
