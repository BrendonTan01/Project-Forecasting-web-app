import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import {
  getProjectHealthStatus,
  getProjectHealthReason,
  getProjectHealthLabel,
  getProjectHealthColour,
  buildRecentWeeklyHoursByProject,
} from "@/lib/utils/projectHealth";
import { DeleteProjectButton } from "./DeleteProjectButton";
import {
  filterEffectiveAssignmentsForWeek,
  getCurrentWeekMondayString,
} from "@/lib/utils/assignmentEffective";
import ProjectSkillRequirementsManager from "./ProjectSkillRequirementsManager";
import type { SkillItem } from "@/app/api/skills/route";
import { getStaffDisplayName } from "@/lib/utils/staffDisplay";
import { isOfficeInScope } from "@/lib/office-scope";

function parseOfficeScope(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function formatProjectDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  const canManageProjects = hasPermission(user.role, "projects:manage");
  const canManageAssignments = hasPermission(user.role, "assignments:manage");
  const canViewFinancials = hasPermission(user.role, "financials:view");

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, client_name, estimated_hours, start_date, end_date, status, office_scope")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!project) notFound();
  if (user.role === "manager") {
    if (!user.officeId || !isOfficeInScope(project.office_scope, user.officeId)) {
      notFound();
    }
  }

  // Actual hours
  const { data: timeEntries } = await supabase
    .from("time_entries")
    .select("staff_id, date, hours, billable_flag")
    .eq("project_id", id)
    .eq("tenant_id", user.tenantId);

  const actualHours = timeEntries?.reduce((sum, e) => sum + Number(e.hours), 0) ?? 0;
  const billableHours = timeEntries?.filter((e) => e.billable_flag).reduce((sum, e) => sum + Number(e.hours), 0) ?? 0;
  const estimated = project.estimated_hours ?? 0;
  const recentWeeklyHoursByProject = buildRecentWeeklyHoursByProject(
    (timeEntries ?? []).map((entry) => ({
      project_id: project.id,
      date: entry.date,
      hours: entry.hours,
    })),
    4
  );
  const health = getProjectHealthStatus(actualHours, project.estimated_hours, project.start_date, {
    endDate: project.end_date,
    recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
  });
  const healthReason = getProjectHealthReason(actualHours, project.estimated_hours, project.start_date, {
    endDate: project.end_date,
    recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
  });

  const staffIdsWithTime = Array.from(
    new Set((timeEntries ?? []).map((entry) => entry.staff_id).filter(Boolean))
  );
  const { data: timeEntryStaffRates } =
    canViewFinancials && staffIdsWithTime.length > 0
      ? await supabase
          .from("staff_profiles")
          .select("id, billable_rate, cost_rate")
          .eq("tenant_id", user.tenantId)
          .in("id", staffIdsWithTime)
      : { data: [] as { id: string; billable_rate: number | null; cost_rate: number | null }[] };

  const staffRateById = new Map(
    (timeEntryStaffRates ?? []).map((row) => [
      row.id,
      {
        billable_rate: row.billable_rate as number | null,
        cost_rate: row.cost_rate as number | null,
      },
    ])
  );

  // Burn rate: use project schedule when available to avoid runtime-dependent calculations.
  const scheduleWeeks = project.start_date && project.end_date
    ? Math.max(
        1,
        (new Date(project.end_date).getTime() - new Date(project.start_date).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      )
    : 1;
  const burnRate = actualHours / scheduleWeeks;

  // Assignments
  const { data: assignments } = await supabase
    .from("project_assignments")
    .select(`
      id,
      allocation_percentage,
      project_id,
      staff_id,
      week_start,
      weekly_hours_allocated,
      projects (start_date, end_date, status),
      staff_profiles (
        id,
        name,
        user_id,
        job_title,
        weekly_capacity_hours,
        users (name, email)
      )
    `)
    .eq("tenant_id", user.tenantId)
    .eq("project_id", id);

  const currentWeekStart = getCurrentWeekMondayString();
  const effectiveAssignments = filterEffectiveAssignmentsForWeek(
    (assignments ?? []).map((row) => ({
      ...row,
      staff_id: row.staff_id,
      project_id: row.project_id,
      week_start: row.week_start ?? null,
      weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
      projects: row.projects ?? null,
    })),
    currentWeekStart
  ).filter((row) => row.weekly_hours_allocated > 0);

  const assignmentStaffIds = Array.from(
    new Set(
      effectiveAssignments
        .map((row) => row.staff_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const { data: assignmentStaffRates } =
    canViewFinancials && assignmentStaffIds.length > 0
      ? await supabase
          .from("staff_profiles")
          .select("id, billable_rate, cost_rate")
          .eq("tenant_id", user.tenantId)
          .in("id", assignmentStaffIds)
      : { data: [] as { id: string; billable_rate: number | null; cost_rate: number | null }[] };

  const plannedRatesSource =
    assignmentStaffRates && assignmentStaffRates.length > 0
      ? assignmentStaffRates
      : timeEntryStaffRates ?? [];
  const plannedBillableRates = plannedRatesSource
    .map((row) => row.billable_rate)
    .filter((rate): rate is number => rate !== null && rate !== undefined);
  const plannedCostRates = plannedRatesSource
    .map((row) => row.cost_rate)
    .filter((rate): rate is number => rate !== null && rate !== undefined);
  const avgPlannedBillableRate =
    plannedBillableRates.length > 0
      ? plannedBillableRates.reduce((sum, value) => sum + Number(value), 0) / plannedBillableRates.length
      : null;
  const avgPlannedCostRate =
    plannedCostRates.length > 0
      ? plannedCostRates.reduce((sum, value) => sum + Number(value), 0) / plannedCostRates.length
      : null;

  const actualRevenue = canViewFinancials
    ? (timeEntries ?? []).reduce((sum, entry) => {
        if (!entry.billable_flag) return sum;
        const billableRate = staffRateById.get(entry.staff_id)?.billable_rate;
        if (billableRate === null || billableRate === undefined) return sum;
        return sum + Number(entry.hours) * Number(billableRate);
      }, 0)
    : null;
  const actualCost = canViewFinancials
    ? (timeEntries ?? []).reduce((sum, entry) => {
        const costRate = staffRateById.get(entry.staff_id)?.cost_rate;
        if (costRate === null || costRate === undefined) return sum;
        return sum + Number(entry.hours) * Number(costRate);
      }, 0)
    : null;
  const actualMargin =
    actualRevenue !== null && actualCost !== null ? actualRevenue - actualCost : null;

  const realizedBillableRate =
    billableHours > 0 && actualRevenue !== null
      ? actualRevenue / billableHours
      : avgPlannedBillableRate;
  const realizedCostRate =
    actualHours > 0 && actualCost !== null ? actualCost / actualHours : avgPlannedCostRate;

  const estimatedRevenueBudget =
    canViewFinancials && estimated > 0 && avgPlannedBillableRate !== null
      ? estimated * avgPlannedBillableRate
      : null;
  const estimatedCostBudget =
    canViewFinancials && estimated > 0 && avgPlannedCostRate !== null
      ? estimated * avgPlannedCostRate
      : null;
  const forecastRevenueAtCompletion =
    canViewFinancials && estimated > 0 && realizedBillableRate !== null
      ? estimated * realizedBillableRate
      : null;
  const forecastCostAtCompletion =
    canViewFinancials && estimated > 0 && realizedCostRate !== null
      ? estimated * realizedCostRate
      : null;
  const forecastMarginAtCompletion =
    forecastRevenueAtCompletion !== null && forecastCostAtCompletion !== null
      ? forecastRevenueAtCompletion - forecastCostAtCompletion
      : null;
  const forecastCostVariance =
    forecastCostAtCompletion !== null && estimatedCostBudget !== null
      ? forecastCostAtCompletion - estimatedCostBudget
      : null;
  const isCostOverBudget =
    forecastCostAtCompletion !== null &&
    estimatedCostBudget !== null &&
    forecastCostAtCompletion > estimatedCostBudget;

  const projectOfficeScope = parseOfficeScope(project.office_scope);
  const [{ data: allSkills }, { data: skillRequirementRows }, { data: officeHoursRows }] = await Promise.all([
    supabase
      .from("skills")
      .select("id, name")
      .eq("tenant_id", user.tenantId)
      .order("name", { ascending: true }),
    supabase
      .from("project_skill_requirements")
      .select("skill_id, required_hours_per_week")
      .eq("tenant_id", user.tenantId)
      .eq("project_id", id),
    projectOfficeScope.length > 0
      ? supabase
          .from("offices")
          .select("id, weekly_working_hours")
          .eq("tenant_id", user.tenantId)
          .in("id", projectOfficeScope)
      : Promise.resolve({ data: [] as { id: string; weekly_working_hours: number }[] }),
  ]);
  const { data: tenantSettings } = await supabase
    .from("tenants")
    .select("planning_hours_per_person_per_week")
    .eq("id", user.tenantId)
    .single();
  const projectPeopleHoursPerWeek =
    (officeHoursRows ?? []).length > 0
      ? (officeHoursRows ?? []).reduce(
          (sum, row) => sum + Number(row.weekly_working_hours ?? 0),
          0
        ) / (officeHoursRows ?? []).length
      : Number(tenantSettings?.planning_hours_per_person_per_week ?? 40);

  const skillItems: SkillItem[] = (allSkills ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? "",
  }));
  const projectSkillRequirements = (skillRequirementRows ?? []).map((row) => ({
    skill_id: row.skill_id,
    required_hours_per_week: Number(row.required_hours_per_week ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div>
          <Link href="/projects" className="app-link text-sm text-zinc-700">
            ← Projects
          </Link>
          <p className="app-section-caption mt-3">Project workspace</p>
          <h1 className="app-page-title mt-2">{project.name}</h1>
          <p className="app-page-subtitle mt-1">
            Manage delivery posture, financial trajectory, and staffing coverage for this engagement.
          </p>
        </div>
        {canManageProjects && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Link
              href={`/projects/${id}/edit`}
              className="app-btn app-btn-secondary focus-ring w-full px-4 py-2 text-sm sm:w-auto"
            >
              Edit
            </Link>
            <DeleteProjectButton projectId={id} projectName={project.name} />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="app-metric-card">
          <p className="app-metric-label">Client</p>
          <p className="app-metric-value mt-1 text-[1.28rem]">{project.client_name ?? "-"}</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Estimated hours</p>
          <p className="app-metric-value mt-1">{estimated > 0 ? `${estimated}h` : "-"}</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Actual hours</p>
          <p className="app-metric-value mt-1">{actualHours}h</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Health</p>
          <p className={`mt-1 text-lg font-semibold ${getProjectHealthColour(health)}`} title={healthReason}>
            {getProjectHealthLabel(health)}
          </p>
          <p className="app-metric-footnote mt-1">{healthReason}</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Start date</p>
          <p className="app-metric-value mt-1 text-[1.28rem]">{formatProjectDate(project.start_date)}</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">End date</p>
          <p className="app-metric-value mt-1 text-[1.28rem]">{formatProjectDate(project.end_date)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="app-metric-card">
          <p className="app-metric-label">Burn rate</p>
          <p className="app-metric-value mt-1">{burnRate.toFixed(1)}h/week</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Billable ratio</p>
          <p className="app-metric-value mt-1">
            {actualHours > 0 ? `${((billableHours / actualHours) * 100).toFixed(0)}%` : "-"}
          </p>
        </div>
      </div>

      {canViewFinancials && (
        <div className="app-card p-4">
          <div className="mb-3">
            <h2 className="font-semibold text-zinc-900">Financial performance</h2>
            <p className="text-xs text-zinc-500">
              Uses current billable and cost rates to track actuals and forecast completion at the current run-rate.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-zinc-200 p-3">
              <p className="text-xs font-medium text-zinc-500">Actual revenue</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{formatCurrency(actualRevenue)}</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3">
              <p className="text-xs font-medium text-zinc-500">Actual cost</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{formatCurrency(actualCost)}</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3">
              <p className="text-xs font-medium text-zinc-500">Actual margin</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{formatCurrency(actualMargin)}</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3">
              <p className="text-xs font-medium text-zinc-500">Projected completion cost</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                {formatCurrency(forecastCostAtCompletion)}
              </p>
              {forecastCostVariance !== null && (
                <p className={`text-xs ${isCostOverBudget ? "text-red-600" : "text-emerald-700"}`}>
                  {isCostOverBudget ? "Over budget" : "Within budget"} by{" "}
                  {formatCurrency(Math.abs(forecastCostVariance))}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-md border border-zinc-200 p-3">
              <p className="text-xs font-medium text-zinc-500">Estimated revenue budget</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">{formatCurrency(estimatedRevenueBudget)}</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3">
              <p className="text-xs font-medium text-zinc-500">Estimated cost budget</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">{formatCurrency(estimatedCostBudget)}</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3">
              <p className="text-xs font-medium text-zinc-500">Projected completion margin</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">
                {formatCurrency(forecastMarginAtCompletion)}
              </p>
              <p className="text-xs text-zinc-500">
                Revenue forecast: {formatCurrency(forecastRevenueAtCompletion)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="app-panel">
        <div className="app-panel-body">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">Skill requirements</h2>
        </div>
        <ProjectSkillRequirementsManager
          projectId={id}
          allSkills={skillItems}
          initialRequirements={projectSkillRequirements}
          canManage={canManageProjects}
          peopleUnitHoursPerWeek={projectPeopleHoursPerWeek}
          peopleUnitSource={projectOfficeScope.length > 0 ? "project_offices" : "tenant_default"}
        />
        </div>
      </div>

      <div className="app-panel">
        <div className="app-panel-body">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">Assigned staff</h2>
          {canManageAssignments && (
            <Link
              href={`/projects/${id}/assignments`}
              className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
            >
              Manage assignments
            </Link>
          )}
        </div>
        {effectiveAssignments.length > 0 ? (
          <div className="app-table-wrap">
          <table className="app-table app-table-dense min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Staff</th>
                <th className="pb-2">Assigned hrs/wk</th>
              </tr>
            </thead>
            <tbody>
              {effectiveAssignments.map((a) => {
                const sp = a.staff_profiles as {
                  id: string;
                  name?: string | null;
                  users?: { name?: string | null; email?: string | null } | { name?: string | null; email?: string | null }[] | null;
                } | { id: string; name?: string | null; users?: { name?: string | null; email?: string | null } | { name?: string | null; email?: string | null }[] | null }[] | null;
                const staff = Array.isArray(sp) ? sp[0] : sp;
                const displayName = getStaffDisplayName(staff?.name, staff?.users);
                return (
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <Link href={`/staff/${staff?.id}`} className="app-link text-zinc-900">
                        {displayName}
                      </Link>
                    </td>
                    <td className="py-2 font-medium text-zinc-800">
                      {Number(a.weekly_hours_allocated).toFixed(1)}h
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No staff assigned</p>
        )}
        </div>
      </div>
    </div>
  );
}
