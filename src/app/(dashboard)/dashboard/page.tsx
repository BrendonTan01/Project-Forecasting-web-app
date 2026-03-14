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
  buildRecentWeeklyHoursByProject,
} from "@/lib/utils/projectHealth";
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
          <div className="app-card overflow-x-auto">
            <table className="app-table min-w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Project</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Client</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Signals</th>
                </tr>
              </thead>
              <tbody>
                {(activeProjects ?? []).map((project) => {
                  const actualHours = actualHoursByProject[project.id] ?? 0;
                  const estimatedHours = Number(project.estimated_hours ?? 0);
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
                  const requiredSkills = requiredSkillsByProject.get(project.id) ?? new Set<string>();
                  const assignedStaffSkills = new Set<string>();
                  const assignedStaffIds = assignmentStaffByProject[project.id] ?? [];
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
                  const deliveryTone: SignalTone =
                    health === "on_track" ? "success" : health === "at_risk" ? "warning" : health === "overrun" ? "danger" : "neutral";
                  const financialTone: SignalTone =
                    financialProgress === null
                      ? "neutral"
                      : financialProgress > 100
                        ? "danger"
                        : financialProgress >= 90
                          ? "warning"
                          : "success";
                  const skillTone: SignalTone =
                    totalRequiredSkills === 0
                      ? "neutral"
                      : missingSkillCount > 0
                        ? "danger"
                        : "success";
                  const financialLabel =
                    financialProgress === null
                      ? "No forecast"
                      : financialProgress > 100
                        ? `Over ${financialProgress.toFixed(0)}%`
                        : `${financialProgress.toFixed(0)}%`;
                  const skillLabel =
                    totalRequiredSkills === 0
                      ? "No skill reqs"
                      : missingSkillCount > 0
                        ? `${missingSkillCount}/${totalRequiredSkills} missing`
                        : "All covered";

                  return (
                    <tr key={project.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/projects/${project.id}`} className="app-link font-medium text-zinc-900">
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-700">{project.client_name ?? "Internal"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={signalBadgeClasses(deliveryTone)} title={healthReason}>
                            <DeliverySignalIcon />
                            <span>Delivery: {getProjectHealthLabel(health)}</span>
                          </span>
                          <span
                            className={signalBadgeClasses(financialTone)}
                            title={
                              financialProgress === null
                                ? "Financial forecast is unavailable due to missing estimate/cost rates."
                                : `Forecast completion spend is ${financialProgress.toFixed(1)}% of budget.`
                            }
                          >
                            <FinancialSignalIcon />
                            <span>Financial: {financialLabel}</span>
                          </span>
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
                            <span>Skills: {skillLabel}</span>
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
