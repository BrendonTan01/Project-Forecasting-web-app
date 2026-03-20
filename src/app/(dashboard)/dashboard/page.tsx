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

  return (
    <div className="space-y-6">
      <section className="app-panel">
        <div className="app-panel-body">
          <p className="app-section-caption">Executive command center</p>
          <h1 className="app-page-title mt-1">Delivery and Capacity Overview</h1>
          <p className="app-page-subtitle mt-2">
            Use this page to decide where to rebalance staffing, which bids to prioritize, and where financial or delivery risk is trending.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
          <h2 className="app-section-heading">At-a-glance overview</h2>
          <p className="text-sm text-zinc-600">
            Visual summary for executives with key forecast, utilization, and capacity signals.
          </p>
          </div>
          <span className="label-sm text-[color:var(--muted-text)]">Updated recently</span>
        </div>
        <DashboardOverviewClient weeks={26} />
      </section>

      {showCurrentProjects && (
        <section className="app-panel space-y-3 p-4 sm:p-5">
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
          <div className="app-table-wrap">
            <table className="app-table app-table-comfortable min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Project</th>
                  <th className="text-left">Client</th>
                  <th className="text-left">Progress</th>
                  <th className="text-left">Skills</th>
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
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
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
                        </div>
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
