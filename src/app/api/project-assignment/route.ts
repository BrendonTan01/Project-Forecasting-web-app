import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleForecastRecalculation } from "@/lib/forecast/engine";

type PatchBody = {
  assignment_id: string;
  staff_id?: string;
  week_start?: string | null;
  weekly_hours_allocated?: number;
};

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

  const { assignment_id, staff_id, week_start, weekly_hours_allocated } = body;

  if (!assignment_id) {
    return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
  }

  // Validate that at least one field is being updated
  if (staff_id === undefined && week_start === undefined && weekly_hours_allocated === undefined) {
    return NextResponse.json(
      { error: "At least one of staff_id, week_start, or weekly_hours_allocated must be provided" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify the assignment belongs to this tenant before updating
  const { data: existing, error: fetchErr } = await admin
    .from("project_assignments")
    .select("id, tenant_id, weekly_hours_allocated")
    .eq("id", assignment_id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  // Build the update payload. The trigger only fires on changes to
  // project_id, staff_id, or tenant_id — and on UPDATE it no longer
  // recalculates weekly_hours_allocated, so explicit values are preserved.
  const updatePayload: Record<string, unknown> = {};

  if (staff_id !== undefined) {
    updatePayload.staff_id = staff_id;
  }
  if (week_start !== undefined) {
    updatePayload.week_start = week_start;
  }
  if (weekly_hours_allocated !== undefined) {
    if (weekly_hours_allocated < 0) {
      return NextResponse.json(
        { error: "weekly_hours_allocated must be >= 0" },
        { status: 400 }
      );
    }
    updatePayload.weekly_hours_allocated = weekly_hours_allocated;
  }

  // If only week_start or weekly_hours_allocated is changing (no staff_id),
  // the trigger won't fire (it only watches project_id, staff_id, tenant_id),
  // so hours are preserved correctly in all cases.

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

  // Fire-and-forget forecast recalculation
  scheduleForecastRecalculation(user.tenantId);

  return NextResponse.json({ assignment: updated });
}
