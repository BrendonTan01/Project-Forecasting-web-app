"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { filterEffectiveAssignmentsForWeek } from "@/lib/utils/assignmentEffective";
import { addUtcDays, toDateString, toUtcDate, toWeekMonday, weekEndFromWeekStart } from "@/lib/utils/week";
import {
  PROPOSAL_OPTIMIZATION_COMPARISON_MODES,
  PROPOSAL_OPTIMIZATION_MODE_LABELS,
  normalizeProposalOptimizationMode,
  type ProposalOptimizationMode,
} from "../optimization-modes";
import { allocateForMode, type StaffCapacitySlice } from "../feasibility-optimizer";

export type WeekFeasibility = {
  weekStart: string; // ISO date (Monday)
  weekEnd: string;   // ISO date (Sunday)
  requiredHours: number;
  achievableHours: number;
  totalFreeCapacity: number;
  allocatedStaffCount: number;
  overallocatedStaffCount: number;
  overallocatedStaff: string[];
  overallocatedHours: number;
  activeProjectCount: number;
};

export type FeasibilityComparison = {
  mode: ProposalOptimizationMode;
  label: string;
  feasibilityPercent: number;
  totalRequired: number;
  totalAchievable: number;
  staffUsedCount: number;
  overallocatedStaffCount: number;
  overallocatedHours: number;
};

export type FeasibilityResult = {
  optimizationMode: ProposalOptimizationMode;
  optimizationLabel: string;
  requiredSkills: Array<{ id: string; name: string; requiredHoursPerWeek: number | null }>;
  hasSkillDemandModel: boolean;
  skillCoverage: Array<{
    skillId: string;
    skillName: string;
    requiredHours: number;
    achievableHours: number;
    shortfallHours: number;
  }>;
  weeks: WeekFeasibility[];
  totalRequired: number;
  totalAchievable: number;
  feasibilityPercent: number;
  staffUsedCount: number;
  totalOverallocatedHours: number;
  staffCount: number;
  recommendedStaff: Array<{
    id: string;
    name: string;
    role: string;
    office: string;
    matchingSkillIds: string[];
    matchingSkillNames: string[];
  }>;
  proposedStaffingPlan: Array<{
    staff_id: string;
    split_percent: number;
    assigned_hours: number;
  }>;
  staffCapacityCandidates: Array<{
    id: string;
    name: string;
    role: string;
    office: string;
    availableHoursWithoutOverallocation: number;
    recommendedSplitPercent: number;
    projectedAssignedHours: number;
    matchingSkillIds: string[];
    matchingSkillNames: string[];
  }>;
  officeNames: string[];
  officeCapacityHotspots: Array<{
    officeId: string | null;
    officeName: string;
    avgUtilization: number;
    peakUtilization: number;
    firstOverloadWeek: number | null;
  }>;
  comparisons?: FeasibilityComparison[];
  error?: never;
};

export type FeasibilityError = {
  error: string;
};

export type SuggestedTeamSplitResult =
  | {
      splitByStaffId: Record<string, number>;
      optimizationMode: ProposalOptimizationMode;
      totalRequired: number;
      totalAchievable: number;
      error?: never;
    }
  | {
      error: string;
    };

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Number of working days (Mon–Fri) in [start, end] inclusive
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

// Leave hours for a staff member within a given week [weekStart, weekEnd]
function leaveHoursInWeek(
  leaves: Array<{ staff_id: string; start_date: string; end_date: string }>,
  staffId: string,
  weekStart: Date,
  weekEnd: Date,
  dailyCapacity: number
): number {
  const weekEndFri = new Date(weekEnd);
  // weekEnd is Sunday; cap to Friday
  weekEndFri.setUTCDate(weekEnd.getUTCDate() - 2);

  let leaveDays = 0;
  for (const lr of leaves) {
    if (lr.staff_id !== staffId) continue;
    const ls = new Date(lr.start_date + "T00:00:00Z");
    const le = new Date(lr.end_date + "T00:00:00Z");
    // Intersect [ls, le] with [weekStart, weekEndFri]
    const overlapStart = ls > weekStart ? ls : weekStart;
    const overlapEnd = le < weekEndFri ? le : weekEndFri;
    if (overlapStart <= overlapEnd) {
      leaveDays += workingDaysInRange(overlapStart, overlapEnd);
    }
  }
  return leaveDays * dailyCapacity;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

type OfficePressureStats = {
  officeId: string | null;
  officeName: string;
  avgUtilization: number;
  peakUtilization: number;
  firstOverloadWeek: number | null;
  pressureFactor: number;
};

function computeOfficePressureFactor(avgUtilization: number, peakUtilization: number): number {
  if (peakUtilization > 0.98) return 0.35;
  if (peakUtilization > 0.95) return 0.5;
  if (peakUtilization > 0.9) return 0.65;
  if (avgUtilization > 0.85) return 0.8;
  return 1;
}

type FeasibilityBaseData = {
  proposal: {
    proposed_start_date: string;
    proposed_end_date: string;
    estimated_hours: number | null;
    estimated_hours_per_week: number | null;
    optimization_mode: ProposalOptimizationMode | null;
    skills: Array<{ id: string; name: string; requiredHoursPerWeek: number | null }>;
  };
  staff: Array<{
    id: string;
    weeklyCapacityHours: number;
    name: string;
    email: string;
    role: string;
    office: string;
    officeId: string | null;
    matchingSkillIds: string[];
  }>;
  overlappingProjects: Array<{ id: string; start_date: string | null; end_date: string | null }>;
  assignments: Array<{
    staff_id: string;
    project_id: string;
    weekly_hours_allocated: number;
    week_start: string | null;
    projects: { start_date: string | null; end_date: string | null; status: string | null } | null;
  }>;
  availability: Array<{ staff_id: string; week_start: string; available_hours: number }>;
  leaves: Array<{ staff_id: string; start_date: string; end_date: string }>;
  officeNames: string[];
};

function parseOfficeIdsKey(officeIdsKey: string): string[] {
  if (!officeIdsKey) return [];
  return officeIdsKey.split(",").filter(Boolean);
}

async function getFeasibilityBaseData(
  tenantId: string,
  proposalId: string,
  officeIdsKey: string,
  includeManagers: boolean
): Promise<FeasibilityBaseData | FeasibilityError> {
  const supabase = await createClient();
  const officeIds = parseOfficeIdsKey(officeIdsKey);

    const { data: proposal, error: proposalError } = await supabase
      .from("project_proposals")
      .select("proposed_start_date, proposed_end_date, estimated_hours, estimated_hours_per_week, optimization_mode, skills")
      .eq("id", proposalId)
      .eq("tenant_id", tenantId)
      .single();

    if (proposalError || !proposal) {
      return { error: "Proposal not found" };
    }

    const proposalSkills = Array.isArray(proposal.skills)
      ? proposal.skills
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const maybeSkill = entry as {
              id?: unknown;
              name?: unknown;
              required_hours_per_week?: unknown;
            };
            if (typeof maybeSkill.id !== "string" || typeof maybeSkill.name !== "string") {
              return null;
            }
            const requiredHoursPerWeek =
              typeof maybeSkill.required_hours_per_week === "number" &&
              Number.isFinite(maybeSkill.required_hours_per_week) &&
              maybeSkill.required_hours_per_week >= 0
                ? maybeSkill.required_hours_per_week
                : null;
            return { id: maybeSkill.id, name: maybeSkill.name, requiredHoursPerWeek };
          })
          .filter(
            (entry): entry is { id: string; name: string; requiredHoursPerWeek: number | null } =>
              Boolean(entry)
          )
      : [];
    const requiredSkillIds = new Set(proposalSkills.map((skill) => skill.id));

    let staffQuery = supabase
      .from("staff_profiles")
      .select("id, weekly_capacity_hours, users!inner(name, email, role, office_id, offices(name))")
      .eq("tenant_id", tenantId);

    if (officeIds.length > 0) {
      staffQuery = staffQuery.in("users.office_id", officeIds);
    }

    const { data: staffRows } = await staffQuery;
    const rawStaff = (staffRows ?? []).map((row) => {
      const userRecord = row.users as
        | {
            name?: string;
            email?: string;
            role?: string;
            office_id?: string | null;
            offices?: { name?: string } | { name?: string }[] | null;
          }
        | {
            name?: string;
            email?: string;
            role?: string;
            office_id?: string | null;
            offices?: { name?: string } | { name?: string }[] | null;
          }[]
        | null;
      const user = Array.isArray(userRecord) ? userRecord[0] : userRecord;
      const officeRecord = Array.isArray(user?.offices) ? user?.offices[0] : user?.offices;
      const displayName = user?.name?.trim() ? user.name.trim() : null;
      return {
        id: row.id,
        weeklyCapacityHours: Number(row.weekly_capacity_hours),
        name: displayName ?? user?.email ?? "Unknown staff",
        email: user?.email ?? "Unknown staff",
        role: user?.role ?? "staff",
        office: officeRecord?.name ?? "No office",
        officeId: user?.office_id ?? null,
        matchingSkillIds: [] as string[],
      };
    });

    // Always exclude administrators — they manage the system and are not capacity resources.
    // Exclude managers when the caller opts out via the includeManagers toggle.
    const roleFilteredStaff = rawStaff.filter((member) => {
      if (member.role === "administrator") return false;
      if (!includeManagers && member.role === "manager") return false;
      return true;
    });

    if (roleFilteredStaff.length === 0) {
      return { error: "No eligible staff found for the selected offices and role filters" };
    }

    const rawStaffIds = roleFilteredStaff.map((member) => member.id);
    const { data: staffSkillRows } =
      requiredSkillIds.size > 0
        ? await supabase
            .from("staff_skills")
            .select("staff_id, skill_id")
            .eq("tenant_id", tenantId)
            .in("staff_id", rawStaffIds)
            .in("skill_id", Array.from(requiredSkillIds))
        : { data: [] };

    const staffSkillIdsByStaff = new Map<string, Set<string>>();
    for (const row of staffSkillRows ?? []) {
      if (!staffSkillIdsByStaff.has(row.staff_id)) {
        staffSkillIdsByStaff.set(row.staff_id, new Set<string>());
      }
      staffSkillIdsByStaff.get(row.staff_id)!.add(row.skill_id);
    }

    const staff = roleFilteredStaff
      .map((member) => ({
        ...member,
        matchingSkillIds: Array.from(staffSkillIdsByStaff.get(member.id) ?? []),
      }))
      .filter((member) =>
        requiredSkillIds.size === 0 ? true : member.matchingSkillIds.length > 0
      );

    if (staff.length === 0) {
      return {
        error:
          "No in-scope staff match the required proposal skills. Adjust skills or office scope and rerun simulation.",
      };
    }

    const officeNames = Array.from(new Set(staff.map((member) => member.office).filter(Boolean))).sort();
    const staffIds = staff.map((member) => member.id);

    const { data: overlappingProjects } = await supabase
      .from("projects")
      .select("id, start_date, end_date")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .lte("start_date", proposal.proposed_end_date)
      .gte("end_date", proposal.proposed_start_date);

    const projectIds = (overlappingProjects ?? []).map((project) => project.id);
    const { data: assignmentRows } = projectIds.length > 0
      ? await supabase
          .from("project_assignments")
          .select("staff_id, project_id, weekly_hours_allocated, week_start, projects(start_date, end_date, status)")
          .eq("tenant_id", tenantId)
          .in("project_id", projectIds)
          .in("staff_id", staffIds)
      : { data: [] };

    const proposalWindowStartMonday = toWeekMonday(proposal.proposed_start_date);
    const proposalWindowEndMonday = toWeekMonday(proposal.proposed_end_date);
    const { data: availabilityRows } = await supabase
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", tenantId)
      .in("staff_id", staffIds)
      .gte("week_start", proposalWindowStartMonday)
      .lte("week_start", proposalWindowEndMonday);

    const { data: leaveRows } = await supabase
      .from("leave_requests")
      .select("staff_id, start_date, end_date")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .in("staff_id", staffIds)
      .lte("start_date", proposal.proposed_end_date)
      .gte("end_date", proposal.proposed_start_date);

  return {
    proposal: {
      proposed_start_date: proposal.proposed_start_date,
      proposed_end_date: proposal.proposed_end_date,
      estimated_hours: proposal.estimated_hours,
      estimated_hours_per_week: proposal.estimated_hours_per_week,
      optimization_mode: proposal.optimization_mode,
      skills: proposalSkills,
    },
    staff,
    overlappingProjects: overlappingProjects ?? [],
    assignments: (assignmentRows ?? []).map((assignment) => {
      const projectRecord = Array.isArray(assignment.projects)
        ? (assignment.projects[0] ?? null)
        : assignment.projects ?? null;
      return {
        staff_id: assignment.staff_id,
        project_id: assignment.project_id,
        weekly_hours_allocated: Number(assignment.weekly_hours_allocated ?? 0),
        week_start: assignment.week_start ?? null,
        projects: projectRecord,
      };
    }),
    availability: (availabilityRows ?? []).map((row) => ({
      staff_id: row.staff_id,
      week_start: row.week_start,
      available_hours: Number(row.available_hours ?? 0),
    })),
    leaves: leaveRows ?? [],
    officeNames,
  };
}

type ComputedFeasibilityCore = Omit<FeasibilityResult, "optimizationMode" | "optimizationLabel" | "comparisons" | "officeNames">;

function allocateSkillDemandForWeek(params: {
  requiredSkills: Array<{ id: string; requiredHours: number }>;
  optimizationMode: ProposalOptimizationMode;
  allowOverallocation: boolean;
  staffPool: StaffCapacitySlice[];
  matchingSkillIdsByStaff: Map<string, Set<string>>;
}): {
  achievableHours: number;
  allocatedStaffIds: Set<string>;
  overallocatedStaffIds: Set<string>;
  overallocatedHours: number;
  assignedHoursByStaff: Map<string, number>;
  skillCoverageById: Map<string, { requiredHours: number; achievableHours: number }>;
} {
  const {
    requiredSkills,
    optimizationMode,
    allowOverallocation,
    staffPool,
    matchingSkillIdsByStaff,
  } = params;
  const assignedByStaff = new Map<string, number>();
  const staffById = new Map(staffPool.map((member) => [member.id, member] as const));
  const skillCoverageById = new Map<string, { requiredHours: number; achievableHours: number }>();
  for (const skill of requiredSkills) {
    skillCoverageById.set(skill.id, { requiredHours: skill.requiredHours, achievableHours: 0 });
  }

  const sortedSkills = [...requiredSkills].sort((a, b) => {
    const aEligible = staffPool.filter((member) =>
      matchingSkillIdsByStaff.get(member.id)?.has(a.id)
    ).length;
    const bEligible = staffPool.filter((member) =>
      matchingSkillIdsByStaff.get(member.id)?.has(b.id)
    ).length;
    if (aEligible !== bEligible) return aEligible - bEligible;
    return b.requiredHours - a.requiredHours;
  });

  // skill_coverage_max uses a two-pass approach:
  //   Pass 1 — allocate up to 50% of each skill's required hours, ensuring every skill
  //            gets at least partial coverage before any skill is fully satisfied.
  //   Pass 2 — allocate the remaining need per skill as normal.
  // All other modes use a single pass (rarest-skill-first order).
  const isSkillCoverageMax = optimizationMode === "skill_coverage_max";
  const passes = isSkillCoverageMax ? [0.5, 1.0] : [1.0];
  const skillAchievableById = new Map<string, number>(sortedSkills.map((s) => [s.id, 0]));

  for (const passFraction of passes) {
    for (const skill of sortedSkills) {
      const eligiblePool: StaffCapacitySlice[] = [];
      for (const member of staffPool) {
        if (!matchingSkillIdsByStaff.get(member.id)?.has(skill.id)) continue;
        const alreadyAssigned = assignedByStaff.get(member.id) ?? 0;
        const remainingCap = Math.max(0, member.freeAtCap - alreadyAssigned);
        if (remainingCap <= 0) continue;
        const remainingAt100 = Math.max(0, member.freeAt100 - alreadyAssigned);
        eligiblePool.push({
          ...member,
          freeAtCap: remainingCap,
          freeAt100: remainingAt100,
        });
      }

      // For skill_coverage_max pass 1: target 50% of required hours.
      // For pass 2 (or single-pass modes): target whatever remains uncovered.
      const alreadyAchieved = skillAchievableById.get(skill.id) ?? 0;
      const passTarget = isSkillCoverageMax
        ? Math.max(0, skill.requiredHours * passFraction - alreadyAchieved)
        : skill.requiredHours;

      if (passTarget <= 0) continue;

      const effectiveMode = isSkillCoverageMax ? "max_feasibility" : optimizationMode;
      const allocation = allocateForMode(
        effectiveMode,
        eligiblePool,
        passTarget,
        allowOverallocation
      );

      let passAchievable = 0;
      for (const [staffId, hours] of Object.entries(allocation.assignedHoursByStaff)) {
        if (hours <= 0) continue;
        assignedByStaff.set(staffId, (assignedByStaff.get(staffId) ?? 0) + hours);
        passAchievable += hours;
      }
      skillAchievableById.set(skill.id, alreadyAchieved + passAchievable);
    }
  }

  for (const skill of sortedSkills) {
    const current = skillCoverageById.get(skill.id);
    if (current) {
      current.achievableHours = round1(skillAchievableById.get(skill.id) ?? 0);
    }
  }

  const allocatedStaffIds = new Set<string>();
  const overallocatedStaffIds = new Set<string>();
  let overallocatedHours = 0;
  let achievableHours = 0;
  for (const [staffId, assigned] of assignedByStaff.entries()) {
    if (assigned <= 0) continue;
    allocatedStaffIds.add(staffId);
    achievableHours += assigned;
    const staff = staffById.get(staffId);
    if (!staff) continue;
    const overAfterAssignment = Math.max(0, staff.committedHours + assigned - staff.effectiveCapacity);
    if (overAfterAssignment > 0) {
      overallocatedStaffIds.add(staffId);
      overallocatedHours += overAfterAssignment;
    }
  }

  return {
    achievableHours: round1(achievableHours),
    allocatedStaffIds,
    overallocatedStaffIds,
    overallocatedHours: round1(overallocatedHours),
    assignedHoursByStaff: assignedByStaff,
    skillCoverageById,
  };
}

function computeOfficePressureStats(params: {
  baseData: FeasibilityBaseData;
  propStart: Date;
  propEnd: Date;
  availabilityByStaffWeek: Map<string, Map<string, number>>;
}): OfficePressureStats[] {
  const { baseData, propStart, propEnd, availabilityByStaffWeek } = params;
  const firstMonday = toUtcDate(toWeekMonday(baseData.proposal.proposed_start_date));
  const weekCursor = new Date(firstMonday);
  const statsByOfficeKey = new Map<
    string,
    {
      officeId: string | null;
      officeName: string;
      weekCount: number;
      sumUtilization: number;
      peakUtilization: number;
      firstOverloadWeek: number | null;
    }
  >();
  let weekIndex = 0;

  while (weekCursor <= propEnd) {
    weekIndex += 1;
    const weekStart = new Date(weekCursor);
    const weekStartStr = toDateString(weekStart);
    const weekEnd = toUtcDate(weekEndFromWeekStart(weekStartStr));
    const effectiveAssignmentsForWeek = filterEffectiveAssignmentsForWeek(
      baseData.assignments,
      weekStartStr
    );
    const committedByStaff = new Map<string, number>();
    for (const assignment of effectiveAssignmentsForWeek) {
      committedByStaff.set(
        assignment.staff_id,
        (committedByStaff.get(assignment.staff_id) ?? 0) + assignment.weekly_hours_allocated
      );
    }

    const clampStart = weekStart < propStart ? propStart : weekStart;
    const clampEnd = weekEnd > propEnd ? propEnd : weekEnd;
    const workDays = workingDaysInRange(clampStart, clampEnd);
    const weekFraction = workDays / 5;

    const capacityByOffice = new Map<string, number>();
    const committedByOffice = new Map<string, number>();
    for (const sp of baseData.staff) {
      const weeklyCapacity =
        availabilityByStaffWeek.get(sp.id)?.get(weekStartStr) ?? sp.weeklyCapacityHours;
      const dailyCapacity = weeklyCapacity / 5;
      const effectiveCapacity = weeklyCapacity * weekFraction;
      const allocatedHours = committedByStaff.get(sp.id) ?? 0;
      const leaveHrs = leaveHoursInWeek(baseData.leaves, sp.id, weekStart, weekEnd, dailyCapacity);
      const committedHours = allocatedHours + leaveHrs;
      const officeKey = sp.officeId ?? "unassigned";
      capacityByOffice.set(officeKey, (capacityByOffice.get(officeKey) ?? 0) + effectiveCapacity);
      committedByOffice.set(officeKey, (committedByOffice.get(officeKey) ?? 0) + committedHours);
      if (!statsByOfficeKey.has(officeKey)) {
        statsByOfficeKey.set(officeKey, {
          officeId: sp.officeId,
          officeName: sp.office,
          weekCount: 0,
          sumUtilization: 0,
          peakUtilization: 0,
          firstOverloadWeek: null,
        });
      }
    }

    for (const [officeKey, capacity] of capacityByOffice.entries()) {
      if (capacity <= 0) continue;
      const util = (committedByOffice.get(officeKey) ?? 0) / capacity;
      const officeStats = statsByOfficeKey.get(officeKey);
      if (!officeStats) continue;
      officeStats.weekCount += 1;
      officeStats.sumUtilization += util;
      officeStats.peakUtilization = Math.max(officeStats.peakUtilization, util);
      if (util > 0.9 && officeStats.firstOverloadWeek === null) {
        officeStats.firstOverloadWeek = weekIndex;
      }
    }

    weekCursor.setTime(addUtcDays(weekCursor, 7).getTime());
  }

  return Array.from(statsByOfficeKey.values()).map((office) => {
    const avgUtilization = office.weekCount > 0 ? office.sumUtilization / office.weekCount : 0;
    const peakUtilization = office.peakUtilization;
    return {
      officeId: office.officeId,
      officeName: office.officeName,
      avgUtilization: Math.round(avgUtilization * 1000) / 1000,
      peakUtilization: Math.round(peakUtilization * 1000) / 1000,
      firstOverloadWeek: office.firstOverloadWeek,
      pressureFactor: computeOfficePressureFactor(avgUtilization, peakUtilization),
    };
  });
}

function computeFeasibilityCore(
  baseData: FeasibilityBaseData,
  optimizationMode: ProposalOptimizationMode,
  allowOverallocation: boolean,
  maxOverallocationPercent: number
): ComputedFeasibilityCore | FeasibilityError {
  if (!baseData.proposal.proposed_start_date || !baseData.proposal.proposed_end_date) {
    return { error: "Proposal must have a start and end date for feasibility analysis" };
  }

  const propStart = new Date(baseData.proposal.proposed_start_date + "T00:00:00Z");
  const propEnd = new Date(baseData.proposal.proposed_end_date + "T00:00:00Z");
  if (propEnd < propStart) return { error: "End date is before start date" };

  const estimatedHoursPerWeek =
    baseData.proposal.estimated_hours_per_week !== null && baseData.proposal.estimated_hours_per_week !== undefined
      ? Number(baseData.proposal.estimated_hours_per_week)
      : null;
  const estimatedTotalHours =
    baseData.proposal.estimated_hours !== null && baseData.proposal.estimated_hours !== undefined
      ? Number(baseData.proposal.estimated_hours)
      : null;
  const totalWorkingDays = workingDaysInRange(propStart, propEnd);

  if (estimatedHoursPerWeek === null && estimatedTotalHours === null) {
    return { error: "Proposal must have an hours estimate for feasibility analysis" };
  }
  if (estimatedHoursPerWeek === null && totalWorkingDays === 0) {
    return { error: "Proposal timeline has no working days" };
  }

  const safeOverallocationPct = Math.max(100, maxOverallocationPercent);
  const projectDates: Record<string, { start: Date; end: Date }> = {};
  for (const project of baseData.overlappingProjects) {
    if (project.start_date && project.end_date) {
      projectDates[project.id] = {
        start: new Date(project.start_date + "T00:00:00Z"),
        end: new Date(project.end_date + "T00:00:00Z"),
      };
    }
  }

  const weeks: WeekFeasibility[] = [];
  const staffUsedById = new Set<string>();
  const assignedHoursByStaff = new Map<string, number>();
  const freeAt100ByStaff = new Map<string, number>();
  const matchingSkillIdsByStaff = new Map(
    baseData.staff.map((staff) => [staff.id, new Set(staff.matchingSkillIds)] as const)
  );
  const hasSkillDemandModel = baseData.proposal.skills.some(
    (skill) => skill.requiredHoursPerWeek !== null && skill.requiredHoursPerWeek > 0
  );
  const skillTotals = new Map<string, { requiredHours: number; achievableHours: number }>(
    baseData.proposal.skills.map((skill) => [
      skill.id,
      { requiredHours: 0, achievableHours: 0 },
    ])
  );
  let rawTotalAchievable = 0;
  let rawTotalOverallocatedHours = 0;
  const firstMonday = toUtcDate(toWeekMonday(baseData.proposal.proposed_start_date));
  const weekCursor = new Date(firstMonday);
  const availabilityByStaffWeek = new Map<string, Map<string, number>>();
  for (const row of baseData.availability) {
    if (!availabilityByStaffWeek.has(row.staff_id)) {
      availabilityByStaffWeek.set(row.staff_id, new Map());
    }
    availabilityByStaffWeek.get(row.staff_id)!.set(row.week_start, row.available_hours);
  }
  for (const staff of baseData.staff) {
    freeAt100ByStaff.set(staff.id, 0);
  }
  const officePressureStats = computeOfficePressureStats({
    baseData,
    propStart,
    propEnd,
    availabilityByStaffWeek,
  });
  const officePressureByOfficeId = new Map(
    officePressureStats.map((office) => [office.officeId, office.pressureFactor] as const)
  );
  const distinctOfficeCount = new Set(baseData.staff.map((staff) => staff.officeId ?? "unassigned")).size;
  const applyOfficePressurePenalty = distinctOfficeCount > 1;

  while (weekCursor <= propEnd) {
    const weekStart = new Date(weekCursor);
    const weekStartStr = toDateString(weekStart);
    const weekEnd = toUtcDate(weekEndFromWeekStart(weekStartStr));
    const effectiveAssignmentsForWeek = filterEffectiveAssignmentsForWeek(
      baseData.assignments,
      weekStartStr
    );
    const committedByStaff = new Map<string, number>();
    for (const assignment of effectiveAssignmentsForWeek) {
      committedByStaff.set(
        assignment.staff_id,
        (committedByStaff.get(assignment.staff_id) ?? 0) + assignment.weekly_hours_allocated
      );
    }

    // Clamp to proposal bounds for partial weeks
    const clampStart = weekStart < propStart ? propStart : weekStart;
    const clampEnd = weekEnd > propEnd ? propEnd : weekEnd;

    // Working days in this (potentially partial) week
    const workDays = workingDaysInRange(clampStart, clampEnd);
    const weekFraction = workDays / 5; // 5 working days in a full week

    const baselineRequiredHours =
      estimatedHoursPerWeek !== null
        ? estimatedHoursPerWeek * weekFraction
        : ((estimatedTotalHours ?? 0) * workDays) / totalWorkingDays;
    const skillRequiredForWeek = hasSkillDemandModel
      ? baseData.proposal.skills
          .filter((skill) => skill.requiredHoursPerWeek !== null && skill.requiredHoursPerWeek > 0)
          .map((skill) => ({
            id: skill.id,
            requiredHours: (skill.requiredHoursPerWeek ?? 0) * weekFraction,
          }))
      : [];
    const requiredHours = hasSkillDemandModel
      ? skillRequiredForWeek.reduce((sum, skill) => sum + skill.requiredHours, 0)
      : baselineRequiredHours;

    const weekStaffCapacity: StaffCapacitySlice[] = [];
    const staffLabelsById = new Map<string, string>();
    let totalFreeCapacity = 0;

    for (const sp of baseData.staff) {
      const weeklyCapacity =
        availabilityByStaffWeek.get(sp.id)?.get(weekStartStr) ?? sp.weeklyCapacityHours;
      const dailyCapacity = weeklyCapacity / 5;
      const effectiveCapacity = weeklyCapacity * weekFraction;
      const allocatedHours = committedByStaff.get(sp.id) ?? 0;

      // Subtract leave
      const leaveHrs = leaveHoursInWeek(baseData.leaves, sp.id, weekStart, weekEnd, dailyCapacity);
      const committedHours = allocatedHours + leaveHrs;
      const freeAt100Raw = Math.max(0, effectiveCapacity - committedHours);
      const maxAllowedHours = effectiveCapacity * (allowOverallocation ? safeOverallocationPct / 100 : 1);
      const freeAtCapRaw = Math.max(0, maxAllowedHours - committedHours);
      const pressureFactor = applyOfficePressurePenalty
        ? (officePressureByOfficeId.get(sp.officeId) ?? 1)
        : 1;
      const freeAt100 = round1(freeAt100Raw * pressureFactor);
      const freeAtCap = round1(freeAtCapRaw * pressureFactor);
      freeAt100ByStaff.set(sp.id, (freeAt100ByStaff.get(sp.id) ?? 0) + freeAt100Raw);

      const staffLabel = sp.name;
      staffLabelsById.set(sp.id, staffLabel);

      totalFreeCapacity += freeAtCap;
      weekStaffCapacity.push({
        id: sp.id,
        officeId: sp.officeId,
        freeAt100,
        freeAtCap,
        effectiveCapacity,
        committedHours,
      });
    }

    const freeCapacityAt100 = weekStaffCapacity.reduce((sum, member) => sum + member.freeAt100, 0);
    const cappedTotalCapacity = allowOverallocation ? totalFreeCapacity : freeCapacityAt100;
    const targetHours = Math.min(requiredHours, cappedTotalCapacity);
    let achievableHours = 0;
    let allocatedStaffIds = new Set<string>();
    let overallocatedStaffIds = new Set<string>();
    let overallocatedHours = 0;
    let weeklyAssignedHoursByStaff = new Map<string, number>();

    if (hasSkillDemandModel && skillRequiredForWeek.length > 0) {
      const skillAllocation = allocateSkillDemandForWeek({
        requiredSkills: skillRequiredForWeek,
        optimizationMode,
        allowOverallocation,
        staffPool: weekStaffCapacity,
        matchingSkillIdsByStaff,
      });
      achievableHours = skillAllocation.achievableHours;
      allocatedStaffIds = skillAllocation.allocatedStaffIds;
      overallocatedStaffIds = skillAllocation.overallocatedStaffIds;
      overallocatedHours = skillAllocation.overallocatedHours;
      weeklyAssignedHoursByStaff = skillAllocation.assignedHoursByStaff;
      for (const [skillId, coverage] of skillAllocation.skillCoverageById.entries()) {
        const totals = skillTotals.get(skillId);
        if (!totals) continue;
        totals.requiredHours += coverage.requiredHours;
        totals.achievableHours += coverage.achievableHours;
      }
    } else {
      const allocation = allocateForMode(
        optimizationMode,
        weekStaffCapacity,
        targetHours,
        allowOverallocation
      );
      achievableHours = allocation.achievableHours;
      allocatedStaffIds = new Set(allocation.allocatedStaffIds);
      overallocatedStaffIds = new Set(allocation.overallocatedStaffIds);
      overallocatedHours = allocation.overallocatedHours;
      weeklyAssignedHoursByStaff = new Map(Object.entries(allocation.assignedHoursByStaff));
    }

    const overallocatedStaffNames = new Set<string>(
      Array.from(overallocatedStaffIds).map((id) => staffLabelsById.get(id) ?? "Unknown staff")
    );
    for (const staffId of allocatedStaffIds) {
      staffUsedById.add(staffId);
    }
    for (const [staffId, assignedHours] of weeklyAssignedHoursByStaff.entries()) {
      if (assignedHours <= 0) continue;
      assignedHoursByStaff.set(
        staffId,
        round1((assignedHoursByStaff.get(staffId) ?? 0) + assignedHours)
      );
    }
    const allocatedStaffCount = allocatedStaffIds.size;
    rawTotalAchievable += achievableHours;
    rawTotalOverallocatedHours += overallocatedHours;

    // Count distinct active projects overlapping this week
    const activeProjectCount = baseData.overlappingProjects.filter((p) => {
      const pd = projectDates[p.id];
      return pd && pd.start <= weekEnd && pd.end >= weekStart;
    }).length;

    weeks.push({
      weekStart: weekStartStr,
      weekEnd: toISODate(weekEnd),
      requiredHours: Math.round(requiredHours * 10) / 10,
      achievableHours: round1(achievableHours),
      totalFreeCapacity: round1(cappedTotalCapacity),
      allocatedStaffCount,
      overallocatedStaffCount: overallocatedStaffNames.size,
      overallocatedStaff: Array.from(overallocatedStaffNames).sort(),
      overallocatedHours: round1(overallocatedHours),
      activeProjectCount,
    });

    weekCursor.setTime(addUtcDays(weekCursor, 7).getTime());
  }

  const roundedWeeklyTotalRequired = weeks.reduce((s, w) => s + w.requiredHours, 0);
  const totalRequired =
    hasSkillDemandModel
      ? roundedWeeklyTotalRequired
      : estimatedHoursPerWeek !== null
        ? roundedWeeklyTotalRequired
        : (estimatedTotalHours ?? roundedWeeklyTotalRequired);
  const totalAchievable = rawTotalAchievable;
  const feasibilityPercent =
    totalRequired > 0 ? Math.round((totalAchievable / totalRequired) * 1000) / 10 : 100;
  const staffUsedCount = staffUsedById.size;
  const totalOverallocatedHours = rawTotalOverallocatedHours;
  const requiredSkillNameById = new Map(
    baseData.proposal.skills.map((skill) => [skill.id, skill.name] as const)
  );
  const totalAssignedAcrossPlan = round1(
    Array.from(assignedHoursByStaff.values()).reduce((sum, value) => sum + value, 0)
  );
  const proposedStaffingPlan = Array.from(assignedHoursByStaff.entries())
    .filter(([, assignedHours]) => assignedHours > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([staffId, assignedHours], index, all) => {
      const splitPercent =
        totalAssignedAcrossPlan > 0 ? round1((assignedHours / totalAssignedAcrossPlan) * 100) : 0;
      const isLast = index === all.length - 1;
      if (!isLast) {
        return {
          staff_id: staffId,
          split_percent: splitPercent,
          assigned_hours: round1(assignedHours),
        };
      }
      const runningSplit = all
        .slice(0, -1)
        .reduce((sum, [, h]) => sum + (totalAssignedAcrossPlan > 0 ? round1((h / totalAssignedAcrossPlan) * 100) : 0), 0);
      return {
        staff_id: staffId,
        split_percent: round1(Math.max(0, 100 - runningSplit)),
        assigned_hours: round1(assignedHours),
      };
    });
  const recommendedSplitByStaff = new Map(
    proposedStaffingPlan.map((member) => [member.staff_id, member.split_percent] as const)
  );
  const projectedHoursByStaff = new Map(
    proposedStaffingPlan.map((member) => [member.staff_id, member.assigned_hours] as const)
  );
  const skillCoverage = baseData.proposal.skills
    .map((skill) => {
      const totals = skillTotals.get(skill.id);
      const required = round1(totals?.requiredHours ?? 0);
      const achievable = round1(totals?.achievableHours ?? 0);
      return {
        skillId: skill.id,
        skillName: skill.name,
        requiredHours: required,
        achievableHours: achievable,
        shortfallHours: round1(Math.max(0, required - achievable)),
      };
    })
    .filter((entry) => entry.requiredHours > 0 || entry.achievableHours > 0)
    .sort((a, b) => a.skillName.localeCompare(b.skillName));
  const officeCapacityHotspots = officePressureStats
    .filter((office) => office.peakUtilization > 0.9)
    .map((office) => ({
      officeId: office.officeId,
      officeName: office.officeName,
      avgUtilization: office.avgUtilization,
      peakUtilization: office.peakUtilization,
      firstOverloadWeek: office.firstOverloadWeek,
    }))
    .sort((a, b) => b.peakUtilization - a.peakUtilization);

  return {
    requiredSkills: baseData.proposal.skills,
    hasSkillDemandModel,
    skillCoverage,
    weeks,
    totalRequired: round1(totalRequired),
    totalAchievable: round1(totalAchievable),
    feasibilityPercent,
    staffUsedCount,
    totalOverallocatedHours: round1(totalOverallocatedHours),
    staffCount: baseData.staff.length,
    recommendedStaff: Array.from(staffUsedById)
      .map((staffId) => {
        const meta = baseData.staff.find((staff) => staff.id === staffId);
        const matchingSkillIds = meta?.matchingSkillIds ?? [];
        return {
          id: staffId,
          name: meta?.name ?? meta?.email ?? "Unknown staff",
          role: meta?.role ?? "staff",
          office: meta?.office ?? "No office",
          matchingSkillIds,
          matchingSkillNames: matchingSkillIds
            .map((skillId) => requiredSkillNameById.get(skillId))
            .filter((name): name is string => Boolean(name))
            .sort((a, b) => a.localeCompare(b)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    proposedStaffingPlan,
    staffCapacityCandidates: baseData.staff
      .map((staff) => ({
        id: staff.id,
        name: staff.name ?? staff.email,
        role: staff.role,
        office: staff.office,
        availableHoursWithoutOverallocation: round1(freeAt100ByStaff.get(staff.id) ?? 0),
        recommendedSplitPercent: recommendedSplitByStaff.get(staff.id) ?? 0,
        projectedAssignedHours: projectedHoursByStaff.get(staff.id) ?? 0,
        matchingSkillIds: staff.matchingSkillIds,
        matchingSkillNames: staff.matchingSkillIds
          .map((skillId) => requiredSkillNameById.get(skillId))
          .filter((name): name is string => Boolean(name))
          .sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    officeCapacityHotspots,
  };
}

export async function computeFeasibility(
  proposalId: string,
  officeIds: string[] | null,
  allowOverallocation: boolean,
  maxOverallocationPercent = 120,
  optimizationModeInput?: ProposalOptimizationMode,
  includeComparisons = false,
  includeManagers = true
): Promise<FeasibilityResult | FeasibilityError> {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };

  const officeIdsKey = officeIds && officeIds.length > 0 ? [...officeIds].sort().join(",") : "";
  const baseDataOrError = await getFeasibilityBaseData(user.tenantId, proposalId, officeIdsKey, includeManagers);
  if ("error" in baseDataOrError) return baseDataOrError;

  const baseData = baseDataOrError;
  const optimizationMode = normalizeProposalOptimizationMode(
    optimizationModeInput ?? baseData.proposal.optimization_mode
  );

  const primaryCore = computeFeasibilityCore(
    baseData,
    optimizationMode,
    allowOverallocation,
    maxOverallocationPercent
  );
  if ("error" in primaryCore) {
    return { error: primaryCore.error ?? "Unable to compute feasibility" };
  }

  let comparisons: FeasibilityComparison[] | undefined;
  if (includeComparisons) {
    const comparisonModes = PROPOSAL_OPTIMIZATION_COMPARISON_MODES.filter((mode) => mode !== optimizationMode);
    comparisons = comparisonModes
      .map((mode) => {
        const scenario = computeFeasibilityCore(baseData, mode, allowOverallocation, maxOverallocationPercent);
        if ("error" in scenario) return null;
        return {
          mode,
          label: PROPOSAL_OPTIMIZATION_MODE_LABELS[mode],
          feasibilityPercent: scenario.feasibilityPercent,
          totalRequired: scenario.totalRequired,
          totalAchievable: scenario.totalAchievable,
          staffUsedCount: scenario.staffUsedCount,
          overallocatedStaffCount: scenario.weeks.reduce((sum, week) => sum + week.overallocatedStaffCount, 0),
          overallocatedHours: scenario.totalOverallocatedHours,
        } satisfies FeasibilityComparison;
      })
      .filter((item): item is FeasibilityComparison => item !== null);
  }

  return {
    optimizationMode,
    optimizationLabel: PROPOSAL_OPTIMIZATION_MODE_LABELS[optimizationMode],
    ...primaryCore,
    officeNames: baseData.officeNames,
    comparisons,
  };
}

export async function computeSuggestedSplitForTeam(
  proposalId: string,
  selectedStaffIds: string[],
  officeIds: string[] | null,
  allowOverallocation: boolean,
  maxOverallocationPercent = 120,
  optimizationModeInput?: ProposalOptimizationMode,
  includeManagers = true
): Promise<SuggestedTeamSplitResult> {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (selectedStaffIds.length === 0) return { error: "Select at least one staff member" };

  const officeIdsKey = officeIds && officeIds.length > 0 ? [...officeIds].sort().join(",") : "";
  const baseDataOrError = await getFeasibilityBaseData(user.tenantId, proposalId, officeIdsKey, includeManagers);
  if ("error" in baseDataOrError) return baseDataOrError;

  const selectedSet = new Set(selectedStaffIds);
  const filteredStaff = baseDataOrError.staff.filter((staff) => selectedSet.has(staff.id));
  if (filteredStaff.length === 0) {
    return { error: "No selected staff are available in the current simulation scope" };
  }

  const optimizationMode = normalizeProposalOptimizationMode(
    optimizationModeInput ?? baseDataOrError.proposal.optimization_mode
  );
  const scopedBaseData: FeasibilityBaseData = {
    ...baseDataOrError,
    staff: filteredStaff,
    assignments: baseDataOrError.assignments.filter((assignment) =>
      selectedSet.has(assignment.staff_id)
    ),
    availability: baseDataOrError.availability.filter((row) => selectedSet.has(row.staff_id)),
    leaves: baseDataOrError.leaves.filter((row) => selectedSet.has(row.staff_id)),
    officeNames: Array.from(new Set(filteredStaff.map((staff) => staff.office).filter(Boolean))).sort(),
  };

  const computed = computeFeasibilityCore(
    scopedBaseData,
    optimizationMode,
    allowOverallocation,
    maxOverallocationPercent
  );
  if ("error" in computed) {
    return { error: computed.error ?? "Unable to compute suggested split for selected team" };
  }

  const splitByStaffId: Record<string, number> = {};
  for (const id of selectedSet) {
    splitByStaffId[id] = 0;
  }
  for (const member of computed.proposedStaffingPlan) {
    splitByStaffId[member.staff_id] = member.split_percent;
  }

  return {
    splitByStaffId,
    optimizationMode,
    totalRequired: computed.totalRequired,
    totalAchievable: computed.totalAchievable,
  };
}
