import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import {
  filterEffectiveAssignmentsForWeek,
  getCurrentWeekMondayString,
} from "@/lib/utils/assignmentEffective";
import { toWeekMonday } from "@/lib/utils/week";
import { isOfficeInScope } from "@/lib/office-scope";

type WeeklyHoursByStaff = Map<string, number>;
type WeeklyHoursByProject = Map<string, WeeklyHoursByStaff>;

type ProjectRow = {
  id: string;
  name: string;
  client_name: string | null;
  estimated_hours: number | null;
  status: string;
  office_scope: unknown;
};

type OutlierSummary = {
  flaggedStaffCount: number;
  peakRatio: number;
};

function buildWeeklyHoursByProject(
  entries: Array<{ project_id: string; staff_id: string; date: string; hours: number }>
): Map<string, WeeklyHoursByProject> {
  const result = new Map<string, WeeklyHoursByProject>();
  for (const entry of entries) {
    const weekStart = toWeekMonday(entry.date);
    if (!result.has(entry.project_id)) result.set(entry.project_id, new Map());
    const byWeek = result.get(entry.project_id)!;
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, new Map());
    const byStaff = byWeek.get(weekStart)!;
    byStaff.set(entry.staff_id, (byStaff.get(entry.staff_id) ?? 0) + Number(entry.hours ?? 0));
  }
  return result;
}

function computeProjectOutliers(
  weeklyByProject: WeeklyHoursByProject,
  currentWeekStart: string
): OutlierSummary {
  const currentByStaff = weeklyByProject.get(currentWeekStart) ?? new Map<string, number>();
  const priorWeeks = Array.from(weeklyByProject.keys())
    .filter((week) => week !== currentWeekStart)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 6);

  let flaggedStaffCount = 0;
  let peakRatio = 0;
  for (const [staffId, currentHours] of currentByStaff.entries()) {
    if (currentHours <= 0) continue;
    const history: number[] = [];
    for (const week of priorWeeks) {
      const hours = weeklyByProject.get(week)?.get(staffId) ?? 0;
      if (hours > 0) history.push(hours);
    }
    if (history.length < 2) continue;
    const baseline = history.reduce((sum, value) => sum + value, 0) / history.length;
    if (baseline <= 0) continue;
    const ratio = currentHours / baseline;
    if (ratio >= 2) {
      flaggedStaffCount += 1;
      peakRatio = Math.max(peakRatio, ratio);
    }
  }

  return { flaggedStaffCount, peakRatio };
}

export default async function ManagerDashboard() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (!user.officeId) {
    return (
      <div className="app-card p-6">
        <h1 className="app-page-title">Manager Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Your account is not assigned to an office yet. Ask an administrator to assign your office to unlock manager views.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: rawProjects } = await supabase
    .from("projects")
    .select("id, name, client_name, estimated_hours, status, office_scope")
    .eq("tenant_id", user.tenantId)
    .eq("status", "active")
    .order("name");

  const projects = ((rawProjects ?? []) as ProjectRow[]).filter((project) =>
    isOfficeInScope(project.office_scope, user.officeId)
  );
  const projectIds = projects.map((project) => project.id);

  const [{ data: assignmentsData }, { data: timeEntries }] = projectIds.length
    ? await Promise.all([
        supabase
          .from("project_assignments")
          .select("project_id, staff_id, week_start, weekly_hours_allocated")
          .eq("tenant_id", user.tenantId)
          .in("project_id", projectIds),
        supabase
          .from("time_entries")
          .select("project_id, staff_id, date, hours")
          .eq("tenant_id", user.tenantId)
          .in("project_id", projectIds),
      ])
    : [
        {
          data: [] as {
            project_id: string;
            staff_id: string;
            week_start: string | null;
            weekly_hours_allocated: number;
          }[],
        },
        { data: [] as { project_id: string; staff_id: string; date: string; hours: number }[] },
      ];

  const currentWeekStart = getCurrentWeekMondayString();
  const effectiveAssignments = filterEffectiveAssignmentsForWeek(
    (assignmentsData ?? []).map((row) => ({
      ...row,
      week_start: row.week_start ?? null,
      weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    })),
    currentWeekStart
  ).filter((row) => row.weekly_hours_allocated > 0);

  const assignedStaffCountByProject = effectiveAssignments.reduce<Record<string, number>>((acc, row) => {
    if (!acc[row.project_id]) acc[row.project_id] = 0;
    acc[row.project_id] += 1;
    return acc;
  }, {});

  const currentWeekHoursByProject = (timeEntries ?? []).reduce<Record<string, number>>((acc, row) => {
    if (toWeekMonday(row.date) !== currentWeekStart) return acc;
    acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.hours ?? 0);
    return acc;
  }, {});

  const weeklyHoursIndex = buildWeeklyHoursByProject(
    (timeEntries ?? []).map((row) => ({
      project_id: row.project_id,
      staff_id: row.staff_id,
      date: row.date,
      hours: Number(row.hours ?? 0),
    }))
  );

  return (
    <div className="space-y-6">
      <section className="app-panel">
        <div className="app-panel-body">
          <p className="app-section-caption">Office delivery command center</p>
          <h1 className="app-page-title mt-1">Manager Project Operations</h1>
          <p className="app-page-subtitle mt-2">
            Track active projects in your office, monitor staffing pressure, and spot unusual time patterns early.
          </p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="app-metric-card">
          <p className="app-metric-label">Active office projects</p>
          <p className="app-metric-value mt-1">{projects.length}</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Assigned this week</p>
          <p className="app-metric-value mt-1">{effectiveAssignments.length}</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Current week</p>
          <p className="app-metric-value mt-1">{currentWeekStart}</p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-900">Ongoing Projects</h2>
            <p className="text-sm text-zinc-600">
              Includes assigned-headcount and relative time outlier detection for this week.
            </p>
          </div>
          <Link href="/projects" className="app-link text-sm font-medium">
            View full projects list
          </Link>
        </div>
        <div className="app-table-wrap">
          <table className="app-table app-table-comfortable min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Project</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Client</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">Assigned staff</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">This week logged</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Time outliers</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const outliers = computeProjectOutliers(
                  weeklyHoursIndex.get(project.id) ?? new Map<string, WeeklyHoursByStaff>(),
                  currentWeekStart
                );
                const outlierLabel =
                  outliers.flaggedStaffCount > 0
                    ? `${outliers.flaggedStaffCount} flagged (peak ${outliers.peakRatio.toFixed(1)}x)`
                    : "No major spikes";
                return (
                  <tr key={project.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${project.id}`} className="app-link font-medium text-zinc-900">
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{project.client_name ?? "Internal"}</td>
                    <td className="px-4 py-3 text-right text-sm text-zinc-800">
                      {assignedStaffCountByProject[project.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-zinc-800">
                      {(currentWeekHoursByProject[project.id] ?? 0).toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          outliers.flaggedStaffCount > 0
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {outlierLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {projects.length === 0 && (
            <p className="p-4 text-sm text-zinc-600">No active projects in your assigned office.</p>
          )}
        </div>
      </section>
    </div>
  );
}
