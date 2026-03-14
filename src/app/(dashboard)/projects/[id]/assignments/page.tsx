import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import AssignmentForm from "./AssignmentForm";
import RemoveAssignmentButton from "./RemoveAssignmentButton";
import { filterEffectiveAssignmentsForWeek, getCurrentWeekMondayString } from "@/lib/utils/assignmentEffective";
import { toWeekMonday, weekEndFromWeekStart } from "@/lib/utils/week";
import { getStaffDisplayName } from "@/lib/utils/staffDisplay";

type UserRecord = {
  name?: string | null;
  email?: string | null;
};

function normalizeUserRecord(raw: unknown): UserRecord | null {
  if (Array.isArray(raw)) {
    return (raw[0] as UserRecord | undefined) ?? null;
  }
  return (raw as UserRecord | null) ?? null;
}

function workingDaysInRange(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  cur.setUTCHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setUTCHours(0, 0, 0, 0);
  while (cur <= endCopy) {
    const dow = cur.getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function leaveHoursInWeek(
  leaves: Array<{ staff_id: string; start_date: string; end_date: string }>,
  staffId: string,
  weekStart: string,
  weekEnd: string,
  dailyCapacity: number
): number {
  const weekStartDate = new Date(`${weekStart}T00:00:00Z`);
  const weekEndDate = new Date(`${weekEnd}T00:00:00Z`);
  const weekEndFri = new Date(weekEndDate);
  weekEndFri.setUTCDate(weekEndDate.getUTCDate() - 2);
  let leaveDays = 0;
  for (const row of leaves) {
    if (row.staff_id !== staffId) continue;
    const leaveStart = new Date(`${row.start_date}T00:00:00Z`);
    const leaveEnd = new Date(`${row.end_date}T00:00:00Z`);
    const overlapStart = leaveStart > weekStartDate ? leaveStart : weekStartDate;
    const overlapEnd = leaveEnd < weekEndFri ? leaveEnd : weekEndFri;
    if (overlapStart <= overlapEnd) {
      leaveDays += workingDaysInRange(overlapStart, overlapEnd);
    }
  }
  return leaveDays * dailyCapacity;
}

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (!hasPermission(user.role, "assignments:manage")) {
    redirect(`/projects/${id}`);
  }

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, start_date")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!project) notFound();

  // Current assignments
  const { data: assignments } = await supabase
    .from("project_assignments")
    .select(`
      id,
      allocation_percentage,
      week_start,
      staff_profiles (
        id,
        name,
        job_title,
        weekly_capacity_hours,
        users (name, email)
      )
    `)
    .eq("tenant_id", user.tenantId)
    .eq("project_id", id)
    .is("week_start", null);

  const assignedStaffIds = new Set(
    (assignments ?? []).map((a) => {
      const sp = Array.isArray(a.staff_profiles) ? a.staff_profiles[0] : a.staff_profiles;
      return sp?.id;
    }).filter(Boolean)
  );

  // All tenant staff not yet assigned
  const { data: allStaff } = await supabase
    .from("staff_profiles")
    .select("id, name, job_title, weekly_capacity_hours, users(name, email)")
    .eq("tenant_id", user.tenantId);

  const currentWeekStart = getCurrentWeekMondayString();
  const projectStartWeek = project.start_date ? toWeekMonday(project.start_date) : currentWeekStart;
  const targetWeekStart = projectStartWeek > currentWeekStart ? projectStartWeek : currentWeekStart;
  const targetWeekEnd = weekEndFromWeekStart(targetWeekStart);

  const allStaffIds = (allStaff ?? []).map((staff) => staff.id);
  const [{ data: requirementRows }, { data: staffSkillRows }, { data: availabilityRows }, { data: assignmentRows }, { data: leaveRows }] =
    allStaffIds.length > 0
      ? await Promise.all([
          supabase
            .from("project_skill_requirements")
            .select("skill_id, required_hours_per_week")
            .eq("tenant_id", user.tenantId)
            .eq("project_id", id),
          supabase
            .from("staff_skills")
            .select("staff_id, skill_id")
            .eq("tenant_id", user.tenantId)
            .in("staff_id", allStaffIds),
          supabase
            .from("staff_availability")
            .select("staff_id, available_hours")
            .eq("tenant_id", user.tenantId)
            .eq("week_start", targetWeekStart)
            .in("staff_id", allStaffIds),
          supabase
            .from("project_assignments")
            .select("staff_id, project_id, weekly_hours_allocated, week_start, projects(start_date, end_date, status)")
            .eq("tenant_id", user.tenantId)
            .in("staff_id", allStaffIds)
            .or(`week_start.is.null,week_start.eq.${targetWeekStart}`),
          supabase
            .from("leave_requests")
            .select("staff_id, start_date, end_date")
            .eq("tenant_id", user.tenantId)
            .eq("status", "approved")
            .in("staff_id", allStaffIds)
            .lte("start_date", targetWeekEnd)
            .gte("end_date", targetWeekStart),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const staffSkillsByStaffId = new Map<string, Set<string>>();
  for (const row of staffSkillRows ?? []) {
    if (!staffSkillsByStaffId.has(row.staff_id)) {
      staffSkillsByStaffId.set(row.staff_id, new Set());
    }
    staffSkillsByStaffId.get(row.staff_id)?.add(row.skill_id);
  }

  const requiredSkills = (requirementRows ?? []).map((row) => ({
    skillId: row.skill_id,
    requiredHoursPerWeek: Number(row.required_hours_per_week ?? 0),
  }));
  const totalRequiredHours = requiredSkills.reduce((sum, row) => sum + row.requiredHoursPerWeek, 0);

  const availableHoursByStaffId = new Map<string, number>();
  for (const row of availabilityRows ?? []) {
    availableHoursByStaffId.set(row.staff_id, Number(row.available_hours ?? 0));
  }

  const effectiveAssignmentRows = filterEffectiveAssignmentsForWeek(
    (assignmentRows ?? []).map((row) => {
      const projectRecord = Array.isArray(row.projects) ? row.projects[0] : row.projects;
      return {
        staff_id: row.staff_id,
        project_id: row.project_id,
        week_start: row.week_start ?? null,
        weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
        projects: projectRecord ?? null,
      };
    }),
    targetWeekStart
  );

  const committedHoursByStaffId = new Map<string, number>();
  for (const row of effectiveAssignmentRows) {
    if (row.project_id === id) continue;
    committedHoursByStaffId.set(
      row.staff_id,
      (committedHoursByStaffId.get(row.staff_id) ?? 0) + row.weekly_hours_allocated
    );
  }

  const availableStaff = (allStaff ?? [])
    .filter((s) => !assignedStaffIds.has(s.id))
    .map((s) => {
      const userRecord = normalizeUserRecord(s.users);
      const displayName = getStaffDisplayName(s.name, s.users);
      const email = userRecord?.email?.trim() ?? "";
      const weeklyCapacity = Number(s.weekly_capacity_hours ?? 0);
      const weeklyAvailable = availableHoursByStaffId.get(s.id) ?? weeklyCapacity;
      const leaveHours = leaveHoursInWeek(
        leaveRows ?? [],
        s.id,
        targetWeekStart,
        targetWeekEnd,
        weeklyAvailable / 5
      );
      const committedHours = committedHoursByStaffId.get(s.id) ?? 0;
      const freeHours = Math.max(0, weeklyAvailable - committedHours - leaveHours);
      const availabilityRatio = weeklyAvailable > 0 ? Math.min(1, freeHours / weeklyAvailable) : 0;

      const staffSkills = staffSkillsByStaffId.get(s.id) ?? new Set<string>();
      const matchedRequiredSkills = requiredSkills.filter((skill) => staffSkills.has(skill.skillId));
      const matchedSkillHours = matchedRequiredSkills.reduce(
        (sum, skill) => sum + skill.requiredHoursPerWeek,
        0
      );
      const skillMatchRatio =
        totalRequiredHours > 0
          ? Math.min(1, matchedSkillHours / totalRequiredHours)
          : 1;

      const suitabilityScore =
        totalRequiredHours > 0
          ? skillMatchRatio * 0.7 + availabilityRatio * 0.3
          : availabilityRatio;

      return {
        id: s.id,
        displayName,
        email,
        jobTitle: s.job_title,
        freeHours,
        skillMatchPercent: Math.round(skillMatchRatio * 100),
        suitabilityScore,
      };
    })
    .sort((a, b) => {
      if (b.suitabilityScore !== a.suitabilityScore) {
        return b.suitabilityScore - a.suitabilityScore;
      }
      if (b.freeHours !== a.freeHours) {
        return b.freeHours - a.freeHours;
      }
      return a.displayName.localeCompare(b.displayName);
    })
    .map((staff, index) => ({
      ...staff,
      isSuggested: index < 3,
    }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="app-link text-sm text-zinc-700">
          ← {project.name}
        </Link>
        <h1 className="app-page-title mt-2">Manage assignments</h1>
        <p className="text-sm text-zinc-600">
          Assign staff to this project and set their allocation percentage.
        </p>
      </div>

      {/* Current assignments */}
      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Current assignments</h2>
        {assignments && assignments.length > 0 ? (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Staff</th>
                <th className="pb-2">Job title</th>
                <th className="pb-2 text-right">Allocation</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                    const sp = Array.isArray(a.staff_profiles) ? a.staff_profiles[0] : a.staff_profiles;
                const usersRaw = sp ? (sp as unknown as { users?: unknown }).users : null;
                const displayName = getStaffDisplayName(
                  (sp as { name?: string | null } | null)?.name,
                  usersRaw
                );
                const staffId = sp?.id ?? "";
                return (
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <Link href={`/staff/${staffId}`} className="app-link text-zinc-900">
                        {displayName}
                      </Link>
                    </td>
                    <td className="py-2 text-sm text-zinc-600">
                      {(sp as { job_title?: string | null } | null)?.job_title ?? "-"}
                    </td>
                    <td className="py-2 text-right font-medium text-zinc-800">
                      {a.allocation_percentage}%
                    </td>
                    <td className="py-2 text-right">
                      <RemoveAssignmentButton
                        projectId={id}
                        assignmentId={a.id}
                        staffLabel={displayName}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500">No staff assigned yet.</p>
        )}
      </div>

      {/* Add assignment */}
      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Add assignment</h2>
        <AssignmentForm projectId={id} availableStaff={availableStaff} />
      </div>
    </div>
  );
}
