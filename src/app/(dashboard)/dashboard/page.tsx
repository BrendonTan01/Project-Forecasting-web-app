import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import StaffDashboard from "./StaffDashboard";
import ManagerDashboard from "./ManagerDashboard";
import { getDashboardWindowData } from "@/lib/dashboard/data";
import DashboardOverviewClient from "@/components/dashboard/DashboardOverviewClient";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
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

function safePercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
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

export default async function DashboardPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role === "staff") {
    return <StaffDashboard />;
  }
  if (user.role === "manager") {
    return <ManagerDashboard />;
  }
  const { start, end } = getPeriodDates();
  await getDashboardWindowData(user.tenantId, start, end, user.id);
  const showCurrentProjects = user.role === "administrator";
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
  const allAssignedStaffIds = Array.from(
    new Set(
      effectiveAssignments
        .map((row) => row.staff_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const [{ data: projectSkillRequirementRows }, { data: staffSkillRows }] = activeProjectIds.length
    ? await Promise.all([
        supabase
          .from("project_skill_requirements")
          .select("project_id, skill_id")
          .eq("tenant_id", user.tenantId)
          .in("project_id", activeProjectIds),
        allAssignedStaffIds.length > 0
          ? supabase
              .from("staff_skills")
              .select("staff_id, skill_id")
              .eq("tenant_id", user.tenantId)
              .in("staff_id", allAssignedStaffIds)
          : Promise.resolve({ data: [] as { staff_id: string; skill_id: string }[] }),
      ])
    : [
        { data: [] as { project_id: string; skill_id: string }[] },
        { data: [] as { staff_id: string; skill_id: string }[] },
      ];
  const requiredSkillsByProject = new Map<string, Set<string>>();
  for (const row of projectSkillRequirementRows ?? []) {
    if (!requiredSkillsByProject.has(row.project_id)) {
      requiredSkillsByProject.set(row.project_id, new Set<string>());
    }
    requiredSkillsByProject.get(row.project_id)?.add(row.skill_id);
  }
  const staffSkillsByStaffId = new Map<string, Set<string>>();
  for (const row of staffSkillRows ?? []) {
    if (!staffSkillsByStaffId.has(row.staff_id)) {
      staffSkillsByStaffId.set(row.staff_id, new Set<string>());
    }
    staffSkillsByStaffId.get(row.staff_id)?.add(row.skill_id);
  }

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

  const portfolioDeliveryProgress = (activeProjects ?? []).reduce((sum, project) => {
    const estimated = Number(project.estimated_hours ?? 0);
    if (estimated <= 0) return sum;
    const actual = actualHoursByProject[project.id] ?? 0;
    return sum + Math.max(0, Math.min(100, (actual / estimated) * 100));
  }, 0);
  const avgDeliveryProgress =
    (activeProjects ?? []).length > 0
      ? portfolioDeliveryProgress / (activeProjects ?? []).length
      : 0;
  const activeSignalCount = (activeProjects ?? []).reduce((count, project) => {
    const requiredSkills = requiredSkillsByProject.get(project.id) ?? new Set<string>();
    if (requiredSkills.size === 0) return count;
    const assignedStaffIds = assignmentStaffByProject[project.id] ?? [];
    const assignedSkillIds = new Set<string>();
    for (const staffId of assignedStaffIds) {
      const staffSkills = staffSkillsByStaffId.get(staffId);
      if (!staffSkills) continue;
      for (const skillId of staffSkills) assignedSkillIds.add(skillId);
    }
    const missing = Array.from(requiredSkills).some((skillId) => !assignedSkillIds.has(skillId));
    return missing ? count + 1 : count;
  }, 0);

  return (
    <div className="space-y-12">
      <section className="rounded-xl border border-[color:color-mix(in_srgb,var(--border)_15%,transparent)] bg-[color:var(--surface-lowest)] p-8 shadow-[var(--shadow-soft)]">
        <h2 className="text-[1.5rem] font-medium tracking-tight text-zinc-900">Delivery and Capacity Overview</h2>
        <p className="mt-1 text-sm text-[color:var(--muted-text)]">
          Strategic visibility into resource allocation, forecasting accuracy, and operational signals.
        </p>
      </section>

      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-semibold text-zinc-900">At-a-glance overview</h3>
          <span className="label-sm uppercase tracking-widest text-[color:var(--muted-text)]">Updated recently</span>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="app-metric-card">
            <span className="app-metric-label">Active projects</span>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-[3.2rem] font-semibold leading-none tracking-tight text-zinc-900">
                {(activeProjects ?? []).length}
              </span>
            </div>
            <p className="mt-2 text-sm text-[color:var(--muted-text)]">Currently in delivery</p>
          </div>
          <div className="app-metric-card">
            <span className="app-metric-label">Avg delivery progress</span>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-[3.2rem] font-semibold leading-none tracking-tight text-zinc-900">
                {avgDeliveryProgress.toFixed(0)}
              </span>
              <span className="mb-1 text-sm font-medium text-[color:var(--muted-text)]">%</span>
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-subtle)]">
              <div className="h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${safePercent(avgDeliveryProgress)}%` }} />
            </div>
          </div>
          <div className="app-metric-card">
            <span className="app-metric-label">Active signals</span>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-[3.2rem] font-semibold leading-none tracking-tight text-zinc-900">
                {activeSignalCount}
              </span>
              <span className="mb-1 text-sm font-medium text-[color:var(--muted-text)]">alerts</span>
            </div>
            <p className="mt-2 text-sm text-[color:var(--muted-text)]">Skill coverage and delivery watchouts</p>
          </div>
        </div>
        <DashboardOverviewClient weeks={26} />
      </section>

      {showCurrentProjects && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900">Current Projects</h3>
            <Link href="/projects" className="app-link group inline-flex items-center gap-1 text-sm font-medium text-[color:var(--muted-text)]">
              View all projects
              <span aria-hidden className="text-xs transition-transform group-hover:translate-x-0.5">-&gt;</span>
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--border)_12%,transparent)] bg-[color:var(--surface-subtle)]">
            <div className="overflow-x-auto">
              <table className="app-table app-table-comfortable min-w-full">
                <thead>
                  <tr>
                    <th className="text-left">Project</th>
                    <th className="text-left">Client</th>
                    <th className="text-left">Delivery Progress</th>
                    <th className="text-left">Financial Progress</th>
                    <th className="text-left">Skills Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeProjects ?? []).map((project) => {
                    const actualHours = actualHoursByProject[project.id] ?? 0;
                    const estimatedHours = Number(project.estimated_hours ?? 0);
                    const deliveryProgress =
                      estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : null;
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
                    const requiredSkills = requiredSkillsByProject.get(project.id) ?? new Set<string>();
                    const assignedStaffSkills = new Set<string>();
                    for (const staffId of assignedStaffIds) {
                      const staffSkills = staffSkillsByStaffId.get(staffId);
                      if (!staffSkills) continue;
                      for (const skillId of staffSkills) assignedStaffSkills.add(skillId);
                    }
                    const missingRequiredSkills = Array.from(requiredSkills).filter(
                      (skillId) => !assignedStaffSkills.has(skillId)
                    );
                    const missingSkillCount = missingRequiredSkills.length;
                    const totalRequiredSkills = requiredSkills.size;
                    const skillTone: SignalTone =
                      totalRequiredSkills === 0
                        ? "neutral"
                        : missingSkillCount > 0
                          ? "danger"
                          : "success";
                    const skillLabel =
                      totalRequiredSkills === 0
                        ? "No skill reqs"
                        : missingSkillCount > 0
                          ? `${missingSkillCount}/${totalRequiredSkills} missing`
                          : "All covered";

                    return (
                      <tr key={project.id}>
                        <td>
                          <Link href={`/projects/${project.id}`} className="app-link font-medium text-zinc-900">
                            {project.name}
                          </Link>
                        </td>
                        <td className="text-sm text-zinc-700">{project.client_name ?? "Internal"}</td>
                        <td className="text-sm text-zinc-800">
                          <div className="flex max-w-56 items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-subtle)]">
                              <div className="h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${safePercent(deliveryProgress ?? 0)}%` }} />
                            </div>
                            <span className="w-8 text-xs font-semibold tabular-nums text-zinc-700">
                              {deliveryProgress === null ? "N/A" : `${deliveryProgress.toFixed(0)}%`}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="flex max-w-56 items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-subtle)]">
                              <div
                                className={`h-full rounded-full ${financialProgress !== null && financialProgress > 100 ? "bg-red-600" : "bg-[color:var(--accent)]/70"}`}
                                style={{ width: `${safePercent(financialProgress ?? 0)}%` }}
                              />
                            </div>
                            <span className="w-8 text-xs font-semibold tabular-nums text-zinc-700">
                              {financialProgress === null ? "N/A" : `${financialProgress.toFixed(0)}%`}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={signalBadgeClasses(skillTone)}
                            title={
                              totalRequiredSkills === 0
                                ? "No skill requirements configured for this project."
                                : missingSkillCount > 0
                                  ? `${missingSkillCount} required skill${missingSkillCount !== 1 ? "s are" : " is"} not covered by current assignments.`
                                  : "All required skills are covered by current assignments."
                            }
                          >
                            <SkillSignalIcon />
                            <span>{skillLabel}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(activeProjects ?? []).length === 0 && (
              <p className="p-4 text-sm text-zinc-600">No active projects found.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
