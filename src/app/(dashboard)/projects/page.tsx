import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { hasPermission } from "@/lib/permissions";
import {
  getProjectHealthStatus,
  getProjectHealthReason,
  getProjectHealthLabel,
  buildRecentWeeklyHoursByProject,
} from "@/lib/utils/projectHealth";
import ProjectStatusFilter from "./ProjectStatusFilter";
import {
  filterEffectiveAssignmentsForWeek,
  getCurrentWeekMondayString,
} from "@/lib/utils/assignmentEffective";
import { getStaffDisplayName } from "@/lib/utils/staffDisplay";
import { isOfficeInScope } from "@/lib/office-scope";

const statusConfig: Record<string, { label: string; colour: string }> = {
  active: { label: "Active", colour: "bg-emerald-50 text-emerald-700" },
  on_hold: { label: "On hold", colour: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", colour: "bg-blue-50 text-blue-700" },
  cancelled: { label: "Cancelled", colour: "bg-zinc-100 text-zinc-500" },
};

type SignalTone = "neutral" | "success" | "warning" | "danger";

function signalBadgeClasses(tone: SignalTone): string {
  const toneClasses: Record<SignalTone, string> = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
  };
  return `inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${toneClasses[tone]}`;
}

function DeliverySignalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2v8l5 3" />
      <circle cx="10" cy="10" r="7" />
    </svg>
  );
}

function FinancialSignalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3v14" />
      <path d="M13.5 6.5c0-1.3-1.6-2.2-3.5-2.2S6.5 5.2 6.5 6.5 8.1 8.7 10 8.7s3.5 1 3.5 2.3S11.9 13.3 10 13.3s-3.5-1-3.5-2.3" />
    </svg>
  );
}

function SkillSignalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 3.5a3 3 0 0 0-3 3v2.2l-2.7 2.7a1 1 0 0 0 0 1.4l3.1 3.1a1 1 0 0 0 1.4 0l2.7-2.7h2.2a3 3 0 0 0 3-3v-3a3 3 0 0 0-3-3z" />
      <circle cx="12.6" cy="7.4" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

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

function parseOfficeScope(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function formatMissingSkillNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
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
  const managerOfficeId = user.role === "manager" ? user.officeId : null;
  const managerMissingOffice = user.role === "manager" && !managerOfficeId;

  if (managerMissingOffice) {
    return (
      <div className="app-card p-6">
        <h1 className="app-page-title">Projects</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Your manager account is not assigned to an office yet. Ask an administrator to set your office to access scoped projects.
        </p>
      </div>
    );
  }

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
      status,
      office_scope
    `)
    .eq("tenant_id", user.tenantId)
    .order("name");

  if (status && status in statusConfig) {
    query = query.eq("status", status);
  }

  const { data: rawProjects } = await query;
  const projects = (rawProjects ?? []).filter((project) =>
    user.role === "manager" ? isOfficeInScope(project.office_scope, managerOfficeId) : true
  );
  const { data: offices } = await supabase
    .from("offices")
    .select("id, name")
    .eq("tenant_id", user.tenantId);
  const officeNameById = new Map((offices ?? []).map((office) => [office.id, office.name]));

  const projectIds = projects.map((p) => p.id);
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
        .select("project_id, staff_id, week_start, weekly_hours_allocated, staff_profiles(name, users(name, email)), projects(start_date, end_date, status)")
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
      const relatedUser = (profile as { users?: { name?: string; email?: string } | { name?: string; email?: string }[] | null } | null)?.users;
      const name = getStaffDisplayName(profile?.name, relatedUser);
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
  const allAssignedStaffIds = Array.from(
    new Set(
      effectiveAssignments
        .map((row) => row.staff_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const [{ data: projectSkillRequirementRows }, { data: staffSkillRows }, { data: skillsRows }] =
    projectIds.length > 0
      ? await Promise.all([
          supabase
            .from("project_skill_requirements")
            .select("project_id, skill_id")
            .eq("tenant_id", user.tenantId)
            .in("project_id", projectIds),
          allAssignedStaffIds.length > 0
            ? supabase
                .from("staff_skills")
                .select("staff_id, skill_id")
                .eq("tenant_id", user.tenantId)
                .in("staff_id", allAssignedStaffIds)
            : Promise.resolve({ data: [] as { staff_id: string; skill_id: string }[] }),
          supabase.from("skills").select("id, name").eq("tenant_id", user.tenantId),
        ])
      : [
          { data: [] as { project_id: string; skill_id: string }[] },
          { data: [] as { staff_id: string; skill_id: string }[] },
          { data: [] as { id: string; name: string | null }[] },
        ];
  const requiredSkillsByProject = new Map<string, Set<string>>();
  for (const row of projectSkillRequirementRows ?? []) {
    if (!requiredSkillsByProject.has(row.project_id)) {
      requiredSkillsByProject.set(row.project_id, new Set<string>());
    }
    requiredSkillsByProject.get(row.project_id)?.add(row.skill_id);
  }
  const skillsByStaffId = new Map<string, Set<string>>();
  for (const row of staffSkillRows ?? []) {
    if (!skillsByStaffId.has(row.staff_id)) {
      skillsByStaffId.set(row.staff_id, new Set<string>());
    }
    skillsByStaffId.get(row.staff_id)?.add(row.skill_id);
  }
  const skillNameById = new Map((skillsRows ?? []).map((row) => [row.id, row.name ?? "Unknown skill"]));

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
    <div className="space-y-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div>
          <p className="app-section-caption">Delivery portfolio</p>
          <h1 className="text-[2.5rem] font-semibold leading-tight tracking-tight text-zinc-900">Projects</h1>
          <p className="mt-1 text-lg text-[color:var(--muted-text)]">Strategic visibility into delivery, staffing, and budget signals.</p>
        </div>
        {canManageProjects && (
          <Link
            href="/projects/new"
            className="app-btn app-btn-primary focus-ring w-full px-6 py-3 text-sm sm:w-auto"
          >
            Add project
          </Link>
        )}
      </div>

      <div className="mb-4 space-y-3">
        <ProjectStatusFilter />
        <p className="mt-2 text-sm text-zinc-600">
          Showing {projects?.length ?? 0} project{(projects?.length ?? 0) === 1 ? "" : "s"}
          {status ? ` (${statusConfig[status]?.label ?? status})` : ""}
        </p>
      </div>

      <div className={`grid gap-3 ${canViewFinancials ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"}`}>
        <div className="app-metric-card">
          <p className="app-metric-label">Tracked projects</p>
          <p className="app-metric-value mt-1">{projects?.length ?? 0}</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Active projects</p>
          <p className="app-metric-value mt-1">
            {(projects ?? []).filter((project) => project.status === "active").length}
          </p>
        </div>
        {canViewFinancials && (
          <div className="app-metric-card">
            <p className="app-metric-label">Projects over budget</p>
            <p className="app-metric-value mt-1 text-red-700">{overBudgetProjects}</p>
          </div>
        )}
        {canViewFinancials && (
          <div className="app-metric-card">
            <p className="app-metric-label">Projected overrun</p>
            <p className="app-metric-value mt-1 text-red-700">{formatCurrency(totalProjectedOverrun)}</p>
          </div>
        )}
      </div>

      <div className="app-toolbar flex flex-nowrap items-center gap-2 overflow-x-auto px-3 py-2 text-xs text-zinc-600 sm:flex-wrap sm:overflow-visible">
        <span className="font-medium text-zinc-700">Portfolio workflow:</span>
        <span className="shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--border)_22%,transparent)] bg-[color:var(--surface-lowest)] px-2.5 py-1">Prioritize risk signals</span>
        <span className="shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--border)_22%,transparent)] bg-[color:var(--surface-lowest)] px-2.5 py-1">Rebalance staffing</span>
        <span className="shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--border)_22%,transparent)] bg-[color:var(--surface-lowest)] px-2.5 py-1">Track budget trajectory</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--border)_14%,transparent)] bg-[color:var(--surface-subtle)] shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
        <table className="app-table app-table-comfortable min-w-full">
          <thead>
            <tr>
              <th className="text-left">Project name</th>
              <th className="text-left">Client</th>
              <th className="text-left">Est vs Actual</th>
              <th className="text-left">Timeline</th>
              <th className="text-left">Scope</th>
              <th className="text-center">Status</th>
              <th className="text-left">Signals</th>
              <th className="text-left">Staff</th>
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
              const officeScopeIds = parseOfficeScope(project.office_scope);
              const officeScopeLabel =
                officeScopeIds.length === 0
                  ? "All offices"
                  : officeScopeIds
                      .map((officeId) => officeNameById.get(officeId) ?? "Unknown office")
                      .join(", ");
              const timeline = `${formatProjectDate(project.start_date)} -> ${formatProjectDate(project.end_date)}`;
              const requiredSkills = requiredSkillsByProject.get(project.id) ?? new Set<string>();
              const coveredSkills = new Set<string>();
              for (const staffId of assignmentStaffByProject[project.id] ?? []) {
                const staffSkills = skillsByStaffId.get(staffId);
                if (!staffSkills) continue;
                for (const skillId of staffSkills) coveredSkills.add(skillId);
              }
              const missingSkillNames = Array.from(requiredSkills)
                .filter((skillId) => !coveredSkills.has(skillId))
                .map((skillId) => skillNameById.get(skillId) ?? "Unknown skill")
                .sort((a, b) => a.localeCompare(b));
              const requiredSkillCount = requiredSkills.size;
              const coveredSkillCount = requiredSkillCount - missingSkillNames.length;
              const deliveryTone: SignalTone =
                health === "on_track"
                  ? "success"
                  : health === "at_risk"
                    ? "warning"
                    : health === "overrun"
                      ? "danger"
                      : "neutral";
              const financial = projectFinancialRisk[project.id];
              const financialTone: SignalTone =
                !canViewFinancials || financial?.variance === null
                  ? "neutral"
                  : financial.isOverBudget
                    ? "danger"
                    : "success";
              const financialLabel =
                !canViewFinancials || financial?.variance === null
                  ? "Financial N/A"
                  : financial.isOverBudget
                    ? `Over ${formatCurrency(financial.variance ?? 0)}`
                    : `Within ${formatCurrency(Math.abs(financial.variance ?? 0))}`;
              const skillTone: SignalTone =
                requiredSkillCount === 0
                  ? "neutral"
                  : missingSkillNames.length > 0
                    ? "danger"
                    : "success";
              const skillLabel =
                requiredSkillCount === 0
                  ? "No skill reqs"
                  : missingSkillNames.length > 0
                    ? `${missingSkillNames.length} missing`
                    : `Covered ${coveredSkillCount}/${requiredSkillCount}`;
              const skillTitle =
                requiredSkillCount === 0
                  ? "No skill requirements configured."
                  : missingSkillNames.length > 0
                    ? `Missing: ${formatMissingSkillNames(missingSkillNames)}`
                    : "All required skills are covered.";

              return (
                <tr key={project.id}>
                  <td>
                    <div className="flex flex-col">
                      <Link
                        href={`/projects/${project.id}`}
                        className="app-link text-sm font-semibold text-zinc-900"
                      >
                        {project.name}
                      </Link>
                      <span className="mt-0.5 text-xs text-[color:var(--muted-text)]">ID: {project.id.slice(0, 8)}</span>
                    </div>
                  </td>
                  <td className="text-sm text-zinc-700">
                    {project.client_name ?? "-"}
                  </td>
                  <td className="text-sm text-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[color:var(--surface-subtle)]">
                        <div
                          className={`h-full rounded-full ${actual > estimated && estimated > 0 ? "bg-red-600" : "bg-[color:var(--accent)]"}`}
                          style={{ width: `${estimated > 0 ? Math.min(100, (actual / estimated) * 100) : 0}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${actual > estimated && estimated > 0 ? "text-red-700" : "text-zinc-700"}`}>
                        {actual} / {estimated > 0 ? estimated : "?"}h
                      </span>
                    </div>
                  </td>
                  <td className="text-xs font-medium text-[color:var(--muted-text)]">
                    {timeline}
                  </td>
                  <td className="text-xs text-zinc-700">
                    {officeScopeLabel}
                  </td>
                  <td className="text-center">
                    <span
                      className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${badge.colour}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={signalBadgeClasses(deliveryTone)} title={healthReason}>
                        <DeliverySignalIcon />
                        <span>{getProjectHealthLabel(health)}</span>
                      </span>
                      {canViewFinancials && (
                        <span className={signalBadgeClasses(financialTone)}>
                          <FinancialSignalIcon />
                          <span>{financialLabel}</span>
                        </span>
                      )}
                      <span className={signalBadgeClasses(skillTone)} title={skillTitle}>
                        <SkillSignalIcon />
                        <span>{skillLabel}</span>
                      </span>
                    </div>
                  </td>
                  <td className="text-xs text-zinc-700">
                    {staffByProject[project.id]?.length
                      ? staffByProject[project.id]
                          .map((s) => `${s.name} (${s.hours}h/wk)`)
                          .join(", ")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {(!projects || projects.length === 0) && (
        <p className="app-empty-state mt-4 p-8 text-center">
          No projects found{status ? ` with status "${statusConfig[status]?.label ?? status}"` : ""}.
        </p>
      )}
    </div>
  );
}
