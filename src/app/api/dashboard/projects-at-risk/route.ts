import { NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRecentWeeklyHoursByProject, getProjectHealthStatus } from "@/lib/utils/projectHealth";

export async function GET() {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "financials:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const admin = createAdminClient();

    const [{ data: projects }, { data: timeEntries }] = await Promise.all([
      admin
        .from("projects")
        .select("id, name, client_name, estimated_hours, status, start_date, end_date")
        .eq("tenant_id", user.tenantId)
        .eq("status", "active")
        .not("estimated_hours", "is", null),

      admin
        .from("time_entries")
        .select("project_id, date, hours")
        .eq("tenant_id", user.tenantId),
    ]);

    // Aggregate actual hours per project
    const actualHoursMap = new Map<string, number>();
    for (const entry of timeEntries ?? []) {
      const current = actualHoursMap.get(entry.project_id) ?? 0;
      actualHoursMap.set(entry.project_id, current + (entry.hours ?? 0));
    }
    const recentWeeklyHoursByProject = buildRecentWeeklyHoursByProject(timeEntries ?? [], 4);

    const atRiskProjects = (projects ?? [])
      .map((project) => {
        const actual_hours = Math.round((actualHoursMap.get(project.id) ?? 0) * 100) / 100;
        const estimated_hours = project.estimated_hours ?? 0;
        const overage_hours = Math.round((actual_hours - estimated_hours) * 100) / 100;
        const health = getProjectHealthStatus(actual_hours, project.estimated_hours, project.start_date, {
          endDate: project.end_date,
          recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
        });
        return {
          id: project.id,
          name: project.name,
          client_name: project.client_name,
          status: project.status,
          health,
          estimated_hours,
          actual_hours,
          overage_hours,
        };
      })
      .filter((project) => project.health === "at_risk" || project.health === "overrun");

    return NextResponse.json({ projects: atRiskProjects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Projects-at-risk calculation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
