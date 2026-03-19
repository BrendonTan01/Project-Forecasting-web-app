import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import {
  filterEffectiveAssignmentsForWeek,
  getCurrentWeekMondayString,
} from "@/lib/utils/assignmentEffective";
import { addUtcDays, toDateString, toUtcDate, toWeekMonday } from "@/lib/utils/week";
import { isOfficeInScope } from "@/lib/office-scope";
import { getStaffDisplayName } from "@/lib/utils/staffDisplay";

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

type SignalTone = "neutral" | "success" | "warning" | "danger";

type EffectiveAssignmentRow = {
  project_id: string;
  staff_id: string;
  week_start: string | null;
  weekly_hours_allocated: number;
};

type LeaveRow = {
  staff_id: string;
  start_date: string;
  end_date: string;
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

function signalBadgeClasses(tone: SignalTone): string {
  const toneClasses: Record<SignalTone, string> = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
  };
  return `inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${toneClasses[tone]}`;
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

function workingDaysInRange(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  current.setUTCHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setUTCHours(0, 0, 0, 0);
  while (current <= endCopy) {
    const day = current.getUTCDay();
    if (day >= 1 && day <= 5) count += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

function leaveDaysInWorkWeek(
  leaves: LeaveRow[],
  staffId: string,
  weekStart: string
): number {
  const weekStartDate = toUtcDate(weekStart);
  const weekEndFriday = addUtcDays(weekStartDate, 4);
  let leaveDays = 0;
  for (const leave of leaves) {
    if (leave.staff_id !== staffId) continue;
    const leaveStart = toUtcDate(leave.start_date);
    const leaveEnd = toUtcDate(leave.end_date);
    const overlapStart = leaveStart > weekStartDate ? leaveStart : weekStartDate;
    const overlapEnd = leaveEnd < weekEndFriday ? leaveEnd : weekEndFriday;
    if (overlapStart <= overlapEnd) {
      leaveDays += workingDaysInRange(overlapStart, overlapEnd);
    }
  }
  return Math.max(0, Math.min(5, leaveDays));
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

  const [{ data: assignmentsData }, { data: timeEntries }, { data: projectSkillRequirementRows }] = projectIds.length
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
        supabase
          .from("project_skill_requirements")
          .select("project_id, skill_id")
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
        { data: [] as { project_id: string; skill_id: string }[] },
      ];

  const currentWeekStart = getCurrentWeekMondayString();
  const effectiveAssignments = filterEffectiveAssignmentsForWeek(
    (assignmentsData ?? []).map((row) => ({
      ...row,
      week_start: row.week_start ?? null,
      weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    })),
    currentWeekStart
  ).filter((row) => row.weekly_hours_allocated > 0) as EffectiveAssignmentRow[];

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
  const currentWeekHoursByProjectStaff = (timeEntries ?? []).reduce<Record<string, number>>((acc, row) => {
    if (toWeekMonday(row.date) !== currentWeekStart) return acc;
    const key = `${row.project_id}:${row.staff_id}`;
    acc[key] = (acc[key] ?? 0) + Number(row.hours ?? 0);
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

  const assignmentsByProject = effectiveAssignments.reduce<Record<string, EffectiveAssignmentRow[]>>((acc, row) => {
    if (!acc[row.project_id]) acc[row.project_id] = [];
    acc[row.project_id].push(row);
    return acc;
  }, {});
  const allAssignedStaffIds = Array.from(
    new Set(
      effectiveAssignments
        .map((row) => row.staff_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const weekEndSunday = toDateString(addUtcDays(toUtcDate(currentWeekStart), 6));
  const [{ data: staffRows }, { data: staffSkillRows }, { data: leaveRows }] = allAssignedStaffIds.length
    ? await Promise.all([
        supabase
          .from("staff_profiles")
          .select("id, name, users(name, email)")
          .eq("tenant_id", user.tenantId)
          .in("id", allAssignedStaffIds),
        supabase
          .from("staff_skills")
          .select("staff_id, skill_id")
          .eq("tenant_id", user.tenantId)
          .in("staff_id", allAssignedStaffIds),
        supabase
          .from("leave_requests")
          .select("staff_id, start_date, end_date")
          .eq("tenant_id", user.tenantId)
          .eq("status", "approved")
          .in("staff_id", allAssignedStaffIds)
          .lte("start_date", weekEndSunday)
          .gte("end_date", currentWeekStart),
      ])
    : [
        {
          data: [] as {
            id: string;
            name: string | null;
            users: { name?: string | null; email?: string | null } | { name?: string | null; email?: string | null }[] | null;
          }[],
        },
        { data: [] as { staff_id: string; skill_id: string }[] },
        { data: [] as LeaveRow[] },
      ];
  const staffNameById = new Map<string, string>();
  for (const staff of staffRows ?? []) {
    staffNameById.set(staff.id, getStaffDisplayName(staff.name, staff.users));
  }
  const leaveDaysByStaff = new Map<string, number>();
  for (const staffId of allAssignedStaffIds) {
    leaveDaysByStaff.set(staffId, leaveDaysInWorkWeek((leaveRows ?? []) as LeaveRow[], staffId, currentWeekStart));
  }
  const staffSkillsByStaffId = new Map<string, Set<string>>();
  for (const row of staffSkillRows ?? []) {
    if (!staffSkillsByStaffId.has(row.staff_id)) {
      staffSkillsByStaffId.set(row.staff_id, new Set<string>());
    }
    staffSkillsByStaffId.get(row.staff_id)?.add(row.skill_id);
  }
  const requiredSkillsByProject = new Map<string, Set<string>>();
  for (const row of projectSkillRequirementRows ?? []) {
    if (!requiredSkillsByProject.has(row.project_id)) {
      requiredSkillsByProject.set(row.project_id, new Set<string>());
    }
    requiredSkillsByProject.get(row.project_id)?.add(row.skill_id);
  }

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
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Staffing risks</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">Time outliers</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const projectAssignments = assignmentsByProject[project.id] ?? [];
                const requiredSkills = requiredSkillsByProject.get(project.id) ?? new Set<string>();
                const assignedStaffSkills = new Set<string>();
                for (const assignment of projectAssignments) {
                  const staffSkills = staffSkillsByStaffId.get(assignment.staff_id);
                  if (!staffSkills) continue;
                  for (const skillId of staffSkills) assignedStaffSkills.add(skillId);
                }
                const missingSkillCount = Array.from(requiredSkills).filter(
                  (skillId) => !assignedStaffSkills.has(skillId)
                ).length;
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
                const leaveImpactedCount = projectAssignments.reduce((count, assignment) => {
                  const leaveDays = leaveDaysByStaff.get(assignment.staff_id) ?? 0;
                  return leaveDays > 0 ? count + 1 : count;
                }, 0);
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
                      {(assignedStaffCountByProject[project.id] ?? 0) > 0 ? (
                        <details className="group inline-block text-left">
                          <summary className="cursor-pointer list-none text-right font-medium text-zinc-800 hover:text-zinc-900">
                            <span className="text-sm">
                              {assignedStaffCountByProject[project.id] ?? 0} assigned
                            </span>
                            <span className="ml-1 text-xs text-zinc-500 transition-transform group-open:rotate-180 inline-block">
                              v
                            </span>
                          </summary>
                          <div className="mt-2 w-[26rem] max-w-[calc(100vw-4rem)] rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                              Assigned staff this week
                            </p>
                            <ul className="space-y-2">
                              {projectAssignments
                                .slice()
                                .sort((a, b) => {
                                  const aName = staffNameById.get(a.staff_id) ?? "Unknown staff";
                                  const bName = staffNameById.get(b.staff_id) ?? "Unknown staff";
                                  return aName.localeCompare(bName);
                                })
                                .map((assignment) => {
                                  const leaveDays = leaveDaysByStaff.get(assignment.staff_id) ?? 0;
                                  const workdayFactor = Math.max(0, (5 - leaveDays) / 5);
                                  const rawAssigned = Number(assignment.weekly_hours_allocated ?? 0);
                                  const proratedAssigned = rawAssigned * workdayFactor;
                                  const loggedHours =
                                    currentWeekHoursByProjectStaff[
                                      `${assignment.project_id}:${assignment.staff_id}`
                                    ] ?? 0;
                                  return (
                                    <li
                                      key={`${assignment.project_id}:${assignment.staff_id}`}
                                      className="rounded-md border border-zinc-100 bg-zinc-50 px-2.5 py-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-zinc-900">
                                          {staffNameById.get(assignment.staff_id) ?? "Unknown staff"}
                                        </span>
                                        {leaveDays > 0 && (
                                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                            On leave ({leaveDays}/5d)
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-600">
                                        <span>
                                          Assigned:{" "}
                                          <span className="font-medium text-zinc-800">
                                            {proratedAssigned.toFixed(1)}h/wk
                                          </span>
                                          {leaveDays > 0 && (
                                            <span className="ml-1 text-zinc-500">
                                              (from {rawAssigned.toFixed(1)}h)
                                            </span>
                                          )}
                                        </span>
                                        <span>
                                          Logged:{" "}
                                          <span className="font-medium text-zinc-800">
                                            {loggedHours.toFixed(1)}h
                                          </span>
                                        </span>
                                      </div>
                                    </li>
                                  );
                                })}
                            </ul>
                          </div>
                        </details>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-zinc-800">
                      {(currentWeekHoursByProject[project.id] ?? 0).toFixed(1)}h
                    </td>
                    <td className="px-4 py-3">
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
                        {leaveImpactedCount > 0 && (
                          <span
                            className={signalBadgeClasses("warning")}
                            title={`${leaveImpactedCount} assigned staff member${leaveImpactedCount !== 1 ? "s have" : " has"} approved leave this week.`}
                          >
                            <span>Leave impact: {leaveImpactedCount}</span>
                          </span>
                        )}
                      </div>
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
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <span className="font-medium text-zinc-700">Staffing risk legend:</span>{" "}
          <span>
            <strong className="font-semibold text-zinc-700">No skill reqs</strong> = no project skill requirements configured,{" "}
            <strong className="font-semibold text-zinc-700">X/Y missing</strong> = required skills not covered by current assignments,{" "}
            <strong className="font-semibold text-zinc-700">Leave impact</strong> = assigned staff have approved leave this week.
          </span>
        </div>
      </section>
    </div>
  );
}
