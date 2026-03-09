import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { hasPermission } from "@/lib/permissions";
import {
  getProjectHealthStatus,
  getProjectHealthReason,
  getProjectHealthLabel,
  getProjectHealthColour,
  buildRecentWeeklyHoursByProject,
} from "@/lib/utils/projectHealth";
import ProjectStatusFilter from "./ProjectStatusFilter";
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

function formatProjectDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  const canManageProjects = hasPermission(user.role, "projects:manage");
  const canViewFinancials = hasPermission(user.role, "financials:view");

  const { status } = await searchParams;

  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select(`
      id,
      name,
      client_name,
      estimated_hours,
      start_date,
      end_date,
      status
    `)
    .eq("tenant_id", user.tenantId)
    .order("name");

  if (status && status in statusConfig) {
    query = query.eq("status", status);
  }

  const { data: projects } = await query;

  const projectIds = projects?.map((p) => p.id) ?? [];
  const { data: actualHoursData } = projectIds.length
    ? await supabase
        .from("time_entries")
        .select("project_id, staff_id, date, hours, billable_flag")
        .eq("tenant_id", user.tenantId)
        .in("project_id", projectIds)
    : { data: [] };

  const actualByProject = (actualHoursData ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.hours);
      return acc;
    },
    {}
  );
  const recentWeeklyHoursByProject = buildRecentWeeklyHoursByProject(
    (actualHoursData ?? []).map((row) => ({
      project_id: row.project_id,
      date: row.date,
      hours: row.hours,
    })),
    4
  );

  const { data: assignmentsData } = projectIds.length
    ? await supabase
        .from("project_assignments")
        .select("project_id, staff_id, week_start, weekly_hours_allocated, staff_profiles(name), projects(start_date, end_date, status)")
        .eq("tenant_id", user.tenantId)
        .in("project_id", projectIds)
    : { data: [] };

  const timeEntryStaffIds = Array.from(
    new Set((actualHoursData ?? []).map((row) => row.staff_id).filter(Boolean))
  );
  const assignmentStaffIds = Array.from(
    new Set((assignmentsData ?? []).map((row) => row.staff_id).filter(Boolean))
  );
  const allFinancialStaffIds = Array.from(new Set([...timeEntryStaffIds, ...assignmentStaffIds]));

  const { data: staffRates } =
    canViewFinancials && allFinancialStaffIds.length > 0
      ? await supabase
          .from("staff_profiles")
          .select("id, billable_rate, cost_rate")
          .eq("tenant_id", user.tenantId)
          .in("id", allFinancialStaffIds)
      : { data: [] as { id: string; billable_rate: number | null; cost_rate: number | null }[] };
  const staffRateById = new Map(
    (staffRates ?? []).map((row) => [
      row.id,
      {
        billable_rate: row.billable_rate as number | null,
        cost_rate: row.cost_rate as number | null,
      },
    ])
  );

  const currentWeekStart = getCurrentWeekMondayString();
  const effectiveAssignments = filterEffectiveAssignmentsForWeek(
    (assignmentsData ?? []).map((row) => ({
      staff_id: row.staff_id,
      project_id: row.project_id,
      week_start: row.week_start ?? null,
      weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
      projects: row.projects ?? null,
      staff_profiles: row.staff_profiles,
    })),
    currentWeekStart
  ).filter((row) => row.weekly_hours_allocated > 0);

  const staffByProject = effectiveAssignments.reduce<Record<string, { name: string; hours: number }[]>>(
    (acc, row) => {
      const profile = Array.isArray(row.staff_profiles)
        ? row.staff_profiles[0]
        : row.staff_profiles;
      const name = profile?.name ?? "Unknown";
      const hours = Number(row.weekly_hours_allocated);
      if (!acc[row.project_id]) acc[row.project_id] = [];
      acc[row.project_id].push({ name, hours });
      return acc;
    },
    {}
  );

  const assignmentStaffByProject = effectiveAssignments.reduce<Record<string, string[]>>(
    (acc, row) => {
      if (!acc[row.project_id]) acc[row.project_id] = [];
      acc[row.project_id].push(row.staff_id);
      return acc;
    },
    {}
  );

  const financialByProject = canViewFinancials
    ? (actualHoursData ?? []).reduce<
        Record<string, { actualCost: number; actualRevenue: number; actualHours: number; billableHours: number }>
      >((acc, row) => {
        const entry = acc[row.project_id] ?? {
          actualCost: 0,
          actualRevenue: 0,
          actualHours: 0,
          billableHours: 0,
        };
        const hours = Number(row.hours ?? 0);
        const rates = staffRateById.get(row.staff_id);
        entry.actualHours += hours;
        if (row.billable_flag) {
          entry.billableHours += hours;
          if (rates?.billable_rate !== null && rates?.billable_rate !== undefined) {
            entry.actualRevenue += hours * Number(rates.billable_rate);
          }
        }
        if (rates?.cost_rate !== null && rates?.cost_rate !== undefined) {
          entry.actualCost += hours * Number(rates.cost_rate);
        }
        acc[row.project_id] = entry;
        return acc;
      }, {})
    : {};

  const projectFinancialRisk = (projects ?? []).reduce<
    Record<
      string,
      {
        projectedCostAtCompletion: number | null;
        estimatedCostBudget: number | null;
        variance: number | null;
        isOverBudget: boolean;
      }
    >
  >((acc, project) => {
    if (!canViewFinancials) {
      acc[project.id] = {
        projectedCostAtCompletion: null,
        estimatedCostBudget: null,
        variance: null,
        isOverBudget: false,
      };
      return acc;
    }
    const estimated = Number(project.estimated_hours ?? 0);
    const realized = financialByProject[project.id] ?? {
      actualCost: 0,
      actualRevenue: 0,
      actualHours: 0,
      billableHours: 0,
    };
    const assignedStaffIds = assignmentStaffByProject[project.id] ?? [];
    const assignedCostRates = assignedStaffIds
      .map((id) => staffRateById.get(id)?.cost_rate)
      .filter((rate): rate is number => rate !== null && rate !== undefined);
    const avgAssignedCostRate =
      assignedCostRates.length > 0
        ? assignedCostRates.reduce((sum, rate) => sum + Number(rate), 0) / assignedCostRates.length
        : null;
    const realizedCostRate =
      realized.actualHours > 0
        ? realized.actualCost / realized.actualHours
        : avgAssignedCostRate;

    const estimatedCostBudget =
      estimated > 0 && avgAssignedCostRate !== null ? estimated * avgAssignedCostRate : null;
    const projectedCostAtCompletion =
      estimated > 0 && realizedCostRate !== null ? estimated * realizedCostRate : null;
    const variance =
      projectedCostAtCompletion !== null && estimatedCostBudget !== null
        ? projectedCostAtCompletion - estimatedCostBudget
        : null;
    const isOverBudget = variance !== null && variance > 0;

    acc[project.id] = {
      projectedCostAtCompletion,
      estimatedCostBudget,
      variance,
      isOverBudget,
    };
    return acc;
  }, {});

  const overBudgetProjects = canViewFinancials
    ? (projects ?? []).filter((project) => projectFinancialRisk[project.id]?.isOverBudget).length
    : 0;
  const totalProjectedOverrun = canViewFinancials
    ? (projects ?? []).reduce((sum, project) => {
        const variance = projectFinancialRisk[project.id]?.variance;
        return variance && variance > 0 ? sum + variance : sum;
      }, 0)
    : 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="app-page-title">Projects</h1>
        {canManageProjects && (
          <Link
            href="/projects/new"
            className="app-btn app-btn-primary focus-ring px-4 py-2 text-sm"
          >
            Add project
          </Link>
        )}
      </div>

      <div className="mb-4">
        <ProjectStatusFilter />
        <p className="mt-2 text-sm text-zinc-600">
          Showing {projects?.length ?? 0} project{(projects?.length ?? 0) === 1 ? "" : "s"}
          {status ? ` (${statusConfig[status]?.label ?? status})` : ""}
        </p>
      </div>

      {canViewFinancials && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="app-card p-3">
            <p className="text-xs font-medium text-zinc-500">Projects over budget</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{overBudgetProjects}</p>
          </div>
          <div className="app-card p-3">
            <p className="text-xs font-medium text-zinc-500">Projected overrun</p>
            <p className="mt-1 text-xl font-semibold text-red-700">{formatCurrency(totalProjectedOverrun)}</p>
          </div>
          <div className="app-card p-3">
            <p className="text-xs font-medium text-zinc-500">Tracked projects</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{projects?.length ?? 0}</p>
          </div>
        </div>
      )}

      <div className="app-card overflow-hidden">
        <table className="app-table min-w-full">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Project
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Client
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                Estimated
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                Actual
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Start date
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                End date
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Health
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Status
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Assigned Staff
              </th>
              {canViewFinancials && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                  Financial risk
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {projects?.map((project) => {
              const actual = actualByProject[project.id] ?? 0;
              const estimated = project.estimated_hours ?? 0;
              const health = getProjectHealthStatus(actual, project.estimated_hours, project.start_date, {
                endDate: project.end_date,
                recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
              });
              const healthReason = getProjectHealthReason(actual, project.estimated_hours, project.start_date, {
                endDate: project.end_date,
                recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
              });
              const badge = statusConfig[project.status] ?? {
                label: project.status,
                colour: "bg-zinc-100 text-zinc-500",
              };

              return (
                <tr key={project.id} className="border-b border-zinc-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="app-link font-medium text-zinc-900"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {project.client_name ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-800">
                    {estimated > 0 ? `${estimated}h` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-800">
                    {actual}h
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {formatProjectDate(project.start_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {formatProjectDate(project.end_date)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-medium ${getProjectHealthColour(health)}`}
                      title={healthReason}
                    >
                      {getProjectHealthLabel(health)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.colour}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {staffByProject[project.id]?.length
                      ? staffByProject[project.id]
                          .map((s) => `${s.name} (${s.hours}h/wk)`)
                          .join(", ")
                      : "—"}
                  </td>
                  {canViewFinancials && (
                    <td className="px-4 py-3 text-sm text-zinc-700">
                      {projectFinancialRisk[project.id]?.variance === null ? (
                        "Insufficient data"
                      ) : projectFinancialRisk[project.id]?.isOverBudget ? (
                        <span className="font-medium text-red-700">
                          Over by {formatCurrency(projectFinancialRisk[project.id].variance ?? 0)}
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-700">
                          Within by {formatCurrency(Math.abs(projectFinancialRisk[project.id].variance ?? 0))}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(!projects || projects.length === 0) && (
        <p className="app-empty-state mt-4 p-8 text-center">
          No projects found{status ? ` with status "${statusConfig[status]?.label ?? status}"` : ""}.
        </p>
      )}
    </div>
  );
}
