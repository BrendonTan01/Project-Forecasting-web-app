import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import StaffDashboard from "./StaffDashboard";
import { getDashboardWindowData } from "@/lib/dashboard/data";
import DashboardOverviewClient from "@/components/dashboard/DashboardOverviewClient";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import {
  getProjectHealthStatus,
  getProjectHealthReason,
  getProjectHealthLabel,
  getProjectHealthColour,
  buildRecentWeeklyHoursByProject,
} from "@/lib/utils/projectHealth";
import HealthStatusWithReason from "@/components/ui/HealthStatusWithReason";
import {
  filterEffectiveAssignmentsForWeek,
  getCurrentWeekMondayString,
} from "@/lib/utils/assignmentEffective";

// Period: last 30 days for utilisation
function getPeriodDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

function safePercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export default async function DashboardPage({
  searchParams: _searchParams,
}: {
  searchParams: Promise<{ health?: string; sort?: string }>;
}) {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role === "staff") {
    return <StaffDashboard />;
  }
  const { start, end } = getPeriodDates();
  await getDashboardWindowData(user.tenantId, start, end, user.id);
  const showCurrentProjects = user.role === "administrator" || user.role === "manager";
  const canViewFinancials = hasPermission(user.role, "financials:view") || showCurrentProjects;

  const supabase = await createClient();
  const { data: activeProjects } = showCurrentProjects
    ? await supabase
        .from("projects")
        .select("id, name, client_name, estimated_hours, status, start_date, end_date")
        .eq("tenant_id", user.tenantId)
        .eq("status", "active")
        .order("name")
    : { data: [] as {
      id: string;
      name: string;
      client_name: string | null;
      estimated_hours: number | null;
      status: string;
      start_date: string | null;
      end_date: string | null;
    }[] };

  const activeProjectIds = (activeProjects ?? []).map((project) => project.id);
  const { data: activeTimeEntries } = activeProjectIds.length
    ? await supabase
        .from("time_entries")
        .select("project_id, staff_id, date, hours")
        .eq("tenant_id", user.tenantId)
        .in("project_id", activeProjectIds)
    : { data: [] as { project_id: string; staff_id: string; date: string; hours: number }[] };

  const actualHoursByProject = (activeTimeEntries ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.hours);
    return acc;
  }, {});
  const recentWeeklyHoursByProject = buildRecentWeeklyHoursByProject(
    (activeTimeEntries ?? []).map((row) => ({
      project_id: row.project_id,
      date: row.date,
      hours: row.hours,
    })),
    4
  );

  const { data: assignmentsData } = activeProjectIds.length
    ? await supabase
        .from("project_assignments")
        .select("project_id, staff_id, week_start, weekly_hours_allocated")
        .eq("tenant_id", user.tenantId)
        .in("project_id", activeProjectIds)
    : { data: [] as {
      project_id: string;
      staff_id: string;
      week_start: string | null;
      weekly_hours_allocated: number;
    }[] };
  const currentWeekStart = getCurrentWeekMondayString();
  const effectiveAssignments = filterEffectiveAssignmentsForWeek(
    (assignmentsData ?? []).map((row) => ({
      ...row,
      week_start: row.week_start ?? null,
      weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    })),
    currentWeekStart
  ).filter((row) => row.weekly_hours_allocated > 0);
  const assignmentStaffByProject = effectiveAssignments.reduce<Record<string, string[]>>((acc, row) => {
    if (!acc[row.project_id]) acc[row.project_id] = [];
    acc[row.project_id].push(row.staff_id);
    return acc;
  }, {});

  const allFinancialStaffIds = Array.from(
    new Set(
      [
        ...(activeTimeEntries ?? []).map((row) => row.staff_id).filter(Boolean),
        ...effectiveAssignments.map((row) => row.staff_id).filter(Boolean),
      ]
    )
  );
  const { data: staffRates } =
    canViewFinancials && allFinancialStaffIds.length > 0
      ? await supabase
          .from("staff_profiles")
          .select("id, cost_rate")
          .eq("tenant_id", user.tenantId)
          .in("id", allFinancialStaffIds)
      : { data: [] as { id: string; cost_rate: number | null }[] };
  const staffCostRateById = new Map((staffRates ?? []).map((row) => [row.id, row.cost_rate]));

  const financialByProject = canViewFinancials
    ? (activeTimeEntries ?? []).reduce<Record<string, { actualCost: number; actualHours: number }>>(
        (acc, row) => {
          const entry = acc[row.project_id] ?? { actualCost: 0, actualHours: 0 };
          const hours = Number(row.hours ?? 0);
          const costRate = staffCostRateById.get(row.staff_id);
          entry.actualHours += hours;
          if (costRate !== null && costRate !== undefined) {
            entry.actualCost += hours * Number(costRate);
          }
          acc[row.project_id] = entry;
          return acc;
        },
        {}
      )
    : {};

  return (
    <div className="space-y-6">
      <h1 className="app-page-title">Executive Dashboard</h1>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-zinc-900">At-a-glance overview</h2>
          <p className="text-sm text-zinc-600">
            Visual summary for executives with key forecast, utilization, and capacity signals.
          </p>
        </div>
        <DashboardOverviewClient weeks={26} />
      </section>

      {showCurrentProjects && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-900">Current Projects</h2>
              <p className="text-sm text-zinc-600">
                Active projects with delivery and financial progress.
              </p>
            </div>
            <Link href="/projects" className="app-link text-sm font-medium">
              View all projects
            </Link>
          </div>
          <div className="app-card overflow-hidden">
            <table className="app-table min-w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Project</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Client</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Progress</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Health</th>
                </tr>
              </thead>
              <tbody>
                {(activeProjects ?? []).map((project) => {
                  const actualHours = actualHoursByProject[project.id] ?? 0;
                  const estimatedHours = Number(project.estimated_hours ?? 0);
                  const deliveryProgress =
                    estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : null;
                  const health = getProjectHealthStatus(actualHours, project.estimated_hours, project.start_date, {
                    endDate: project.end_date,
                    recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
                  });
                  const healthReason = getProjectHealthReason(actualHours, project.estimated_hours, project.start_date, {
                    endDate: project.end_date,
                    recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
                  });

                  const financialData = financialByProject[project.id] ?? {
                    actualCost: 0,
                    actualHours: 0,
                  };
                  const assignedStaffIds = assignmentStaffByProject[project.id] ?? [];
                  const assignedCostRates = assignedStaffIds
                    .map((id) => staffCostRateById.get(id))
                    .filter((rate): rate is number => rate !== null && rate !== undefined);
                  const avgAssignedCostRate =
                    assignedCostRates.length > 0
                      ? assignedCostRates.reduce((sum, rate) => sum + Number(rate), 0) / assignedCostRates.length
                      : null;
                  const estimatedCostBudget =
                    estimatedHours > 0 && avgAssignedCostRate !== null
                      ? estimatedHours * avgAssignedCostRate
                      : null;
                  const financialProgress =
                    canViewFinancials && estimatedCostBudget && estimatedCostBudget > 0
                      ? (financialData.actualCost / estimatedCostBudget) * 100
                      : null;

                  return (
                    <tr key={project.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/projects/${project.id}`} className="app-link font-medium text-zinc-900">
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-700">{project.client_name ?? "Internal"}</td>
                      <td className="px-4 py-3 text-sm text-zinc-800">
                        <div className="max-w-72 space-y-2">
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="font-medium text-zinc-600">Delivery</span>
                              <span className="flex items-center gap-1 tabular-nums text-zinc-700">
                                <span
                                  className={deliveryProgress !== null && deliveryProgress > 100 ? "font-semibold text-red-700" : ""}
                                >
                                  {deliveryProgress === null ? "N/A" : `${deliveryProgress.toFixed(0)}%`}
                                </span>
                                {deliveryProgress !== null && deliveryProgress > 100 && (
                                  <span className="inline-flex rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                    &gt;100%
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="h-2.5 w-full overflow-visible rounded-full bg-zinc-200">
                              <div
                                className={`h-full rounded-full ${deliveryProgress !== null && deliveryProgress > 100 ? "bg-red-600" : "bg-blue-600"}`}
                                style={{ width: `${safePercent(deliveryProgress ?? 0)}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="font-medium text-zinc-600">Financial</span>
                              <span className="flex items-center gap-1 tabular-nums text-zinc-700">
                                <span
                                  className={financialProgress !== null && financialProgress > 100 ? "font-semibold text-red-700" : ""}
                                >
                                  {financialProgress === null ? "N/A" : `${financialProgress.toFixed(0)}%`}
                                </span>
                                {financialProgress !== null && financialProgress > 100 && (
                                  <span className="inline-flex rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                    &gt;100%
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="h-2.5 w-full overflow-visible rounded-full bg-zinc-200">
                              <div
                                className={`h-full rounded-full ${financialProgress !== null && financialProgress > 100 ? "bg-red-600" : "bg-emerald-600"}`}
                                style={{ width: `${safePercent(financialProgress ?? 0)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        <HealthStatusWithReason
                          label={getProjectHealthLabel(health)}
                          colourClass={getProjectHealthColour(health)}
                          reason={healthReason}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(activeProjects ?? []).length === 0 && (
              <p className="p-4 text-sm text-zinc-600">No active projects found.</p>
            )}
          </div>
        </section>
      )}

    </div>
  );
}
