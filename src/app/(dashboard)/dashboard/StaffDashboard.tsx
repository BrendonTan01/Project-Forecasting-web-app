import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffId, getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { getRelationOne } from "@/lib/utils/supabase-relations";
import {
  getProjectHealthStatus,
  getProjectHealthLabel,
  getProjectHealthColour,
} from "@/lib/utils/projectHealth";
import {
  filterEffectiveAssignmentsForWeek,
  getCurrentWeekMondayString,
} from "@/lib/utils/assignmentEffective";

const statusConfig: Record<string, { label: string; colour: string }> = {
  active: { label: "Active", colour: "bg-emerald-50 text-emerald-700" },
  on_hold: { label: "On hold", colour: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", colour: "bg-blue-50 text-blue-700" },
  cancelled: { label: "Cancelled", colour: "bg-zinc-100 text-zinc-500" },
};

type AssignmentRow = {
  staff_id: string;
  project_id: string;
  week_start: string | null;
  weekly_hours_allocated: number;
  allocation_percentage: number;
  projects: {
    id: string;
    name: string;
    client_name: string | null;
    estimated_hours: number | null;
    status: string;
  } | {
    id: string;
    name: string;
    client_name: string | null;
    estimated_hours: number | null;
    status: string;
  }[] | null;
};

export default async function StaffDashboard() {
  const user = await getCurrentUserWithTenant();
  const staffId = await getCurrentStaffId();
  if (!user || !staffId) return null;

  const supabase = await createClient();
  const { data: staffProfile } = await supabase
    .from("staff_profiles")
    .select("weekly_capacity_hours")
    .eq("tenant_id", user.tenantId)
    .eq("id", staffId)
    .single();

  const weeklyCapacity = Number(staffProfile?.weekly_capacity_hours ?? 0);

  const { data: assignmentRows } = await supabase
    .from("project_assignments")
    .select("staff_id, project_id, week_start, weekly_hours_allocated, allocation_percentage, projects(id, name, client_name, estimated_hours, status, start_date, end_date)")
    .eq("tenant_id", user.tenantId)
    .eq("staff_id", staffId);

  const currentWeekStart = getCurrentWeekMondayString();
  const effectiveAssignmentRows = filterEffectiveAssignmentsForWeek(
    (assignmentRows ?? []).map((row) => ({
      ...row,
      week_start: row.week_start ?? null,
      weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    })),
    currentWeekStart
  ).filter((row) => row.weekly_hours_allocated > 0);

  const assignments = effectiveAssignmentRows.map((row) => {
    const project = getRelationOne((row as AssignmentRow).projects) as {
      id: string;
      name: string;
      client_name: string | null;
      estimated_hours: number | null;
      status: string;
    } | null;

    return {
      projectId: row.project_id,
      weeklyHoursAllocated: Number(row.weekly_hours_allocated),
      project,
    };
  });

  const projectIds = assignments.map((assignment) => assignment.projectId);
  const { data: timeEntries } = projectIds.length
    ? await supabase
        .from("time_entries")
        .select("project_id, hours")
        .eq("tenant_id", user.tenantId)
        .eq("staff_id", staffId)
        .in("project_id", projectIds)
    : { data: [] as { project_id: string; hours: number }[] };

  const actualByProject = (timeEntries ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.hours);
    return acc;
  }, {});

  const projects = Object.values(
    assignments.reduce<Record<string, {
      id: string;
      name: string;
      clientName: string | null;
      status: string;
      estimatedHours: number | null;
      weeklyHoursAllocated: number;
      actualHours: number;
    }>>((acc, assignment) => {
      if (!assignment.project) return acc;
      if (!acc[assignment.projectId]) {
        acc[assignment.projectId] = {
          id: assignment.project.id,
          name: assignment.project.name,
          clientName: assignment.project.client_name,
          status: assignment.project.status,
          estimatedHours: assignment.project.estimated_hours,
          weeklyHoursAllocated: 0,
          actualHours: actualByProject[assignment.projectId] ?? 0,
        };
      }
      acc[assignment.projectId].weeklyHoursAllocated += assignment.weeklyHoursAllocated;
      return acc;
    }, {})
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="app-page-title">My Dashboard</h1>
          <p className="app-page-subtitle">
            Your assigned projects, current progress, and quick access to log hours.
          </p>
        </div>
        <Link
          href="/time-entry"
          className="app-btn app-btn-primary focus-ring px-4 py-2 text-sm"
        >
          Add time
        </Link>
      </div>

      {projects.length > 0 ? (
        <div className="app-card overflow-hidden">
          <table className="app-table min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Project</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Status</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">Allocation</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">Progress</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">Health</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">Action</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const health = getProjectHealthStatus(project.actualHours, project.estimatedHours);
                const progress = project.estimatedHours && project.estimatedHours > 0
                  ? `${project.actualHours}h / ${project.estimatedHours}h (${((project.actualHours / project.estimatedHours) * 100).toFixed(1)}%)`
                  : `${project.actualHours}h logged`;
                const statusBadge = statusConfig[project.status] ?? {
                  label: project.status,
                  colour: "bg-zinc-100 text-zinc-500",
                };

                return (
                  <tr key={project.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{project.name}</p>
                      <p className="text-sm text-zinc-600">{project.clientName ?? "Internal"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.colour}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-zinc-800">
                      {weeklyCapacity > 0
                        ? `${((project.weeklyHoursAllocated / weeklyCapacity) * 100).toFixed(0)}%`
                        : "0%"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-zinc-800">{progress}</td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${getProjectHealthColour(health)}`}>
                      {getProjectHealthLabel(health)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href="/time-entry"
                        className="app-btn app-btn-secondary focus-ring px-2.5 py-1 text-xs"
                      >
                        Add time
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="app-card p-6">
          <p className="text-sm text-zinc-700">
            You are not currently assigned to any projects.
          </p>
          <Link
            href="/time-entry"
            className="app-btn app-btn-secondary focus-ring mt-3 inline-flex px-3 py-1.5 text-sm"
          >
            Go to time entry
          </Link>
        </div>
      )}
    </div>
  );
}
