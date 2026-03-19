"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PROPOSAL_OPTIMIZATION_MODE,
  normalizeProposalOptimizationMode,
  type ProposalOptimizationMode,
} from "./optimization-modes";
import { writeAuditLog } from "@/lib/audit/log";
import type { ProposedTeamMember } from "@/lib/types";

export type ProposalFormData = {
  name: string;
  client_name?: string;
  proposed_start_date?: string;
  proposed_end_date?: string;
  estimated_hours?: number;
  estimated_hours_per_week?: number;
  win_probability?: number;
  skills?: Array<{ id: string; name: string; required_hours_per_week?: number }>;
  office_scope?: string[] | null;
  optimization_mode?: ProposalOptimizationMode;
  status: "draft" | "submitted" | "won" | "lost" | "converted";
  notes?: string;
};

function normalizeWinProbability(value?: number): number {
  if (value === undefined || Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export async function createProposal(data: ProposalFormData) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "proposals:manage")) {
    return { error: "You do not have permission to create proposals" };
  }
  if (data.status !== "draft" && (!data.proposed_start_date || !data.proposed_end_date)) {
    return { error: "Set both timeline dates before changing status from draft" };
  }

  const supabase = await createClient();
  const { data: proposal, error } = await supabase
    .from("project_proposals")
    .insert({
      tenant_id: user.tenantId,
      name: data.name.trim(),
      client_name: data.client_name?.trim() || null,
      proposed_start_date: data.proposed_start_date || null,
      proposed_end_date: data.proposed_end_date || null,
      estimated_hours: data.estimated_hours ?? null,
      estimated_hours_per_week: data.estimated_hours_per_week ?? null,
      win_probability: normalizeWinProbability(data.win_probability),
      skills: data.skills?.length ? data.skills : null,
      office_scope: data.office_scope?.length ? data.office_scope : null,
      optimization_mode: normalizeProposalOptimizationMode(data.optimization_mode ?? DEFAULT_PROPOSAL_OPTIMIZATION_MODE),
      status: data.status,
      notes: data.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/proposals");
  revalidatePath("/dashboard");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "proposal.created",
    entityType: "proposal",
    entityId: proposal.id,
    newValue: { name: data.name, status: data.status },
  });
  return { success: true, id: proposal.id };
}

export async function updateProposal(id: string, data: Partial<ProposalFormData>) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "proposals:manage")) {
    return { error: "You do not have permission to edit proposals" };
  }

  if (data.status !== undefined) {
    const supabase = await createClient();
    const { data: existing, error: existingError } = await supabase
      .from("project_proposals")
      .select("status, proposed_start_date, proposed_end_date")
      .eq("id", id)
      .eq("tenant_id", user.tenantId)
      .single();

    if (existingError) return { error: existingError.message };

    const nextStatus = data.status;
    const isLeavingDraft = existing?.status === "draft" && nextStatus !== "draft";
    if (isLeavingDraft) {
      const nextStart = data.proposed_start_date ?? existing?.proposed_start_date ?? null;
      const nextEnd = data.proposed_end_date ?? existing?.proposed_end_date ?? null;
      if (!nextStart || !nextEnd) {
        return { error: "Set both timeline dates before changing status from draft" };
      }
    }
  }

  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.client_name !== undefined) updateData.client_name = data.client_name?.trim() || null;
  if (data.proposed_start_date !== undefined) updateData.proposed_start_date = data.proposed_start_date || null;
  if (data.proposed_end_date !== undefined) updateData.proposed_end_date = data.proposed_end_date || null;
  if (data.estimated_hours !== undefined) updateData.estimated_hours = data.estimated_hours ?? null;
  if (data.estimated_hours_per_week !== undefined) updateData.estimated_hours_per_week = data.estimated_hours_per_week ?? null;
  if (data.win_probability !== undefined) updateData.win_probability = normalizeWinProbability(data.win_probability);
  if ("skills" in data) updateData.skills = data.skills?.length ? data.skills : null;
  if ("office_scope" in data) updateData.office_scope = data.office_scope?.length ? data.office_scope : null;
  if (data.optimization_mode !== undefined) {
    updateData.optimization_mode = normalizeProposalOptimizationMode(data.optimization_mode);
  }
  if (data.status !== undefined) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;

  updateData.updated_at = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_proposals")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/dashboard");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "proposal.updated",
    entityType: "proposal",
    entityId: id,
    newValue: updateData,
  });
  return { success: true };
}

export type ConvertProposalOverrides = {
  name: string;
  client_name?: string;
  start_date?: string;
  end_date?: string;
  estimated_hours?: number;
  office_scope?: string[] | null;
  notes?: string;
  skills?: Array<{ id: string; name: string; required_hours_per_week?: number }>;
  team_assignments?: Array<{
    staff_id: string;
    allocation_percentage: number;
    weekly_hours_allocated: number;
  }>;
};

export async function convertProposalToProject(
  proposalId: string,
  overrides: ConvertProposalOverrides
) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "proposals:manage")) {
    return { error: "You do not have permission to convert proposals" };
  }

  const supabase = await createClient();

  const { data: proposal, error: proposalError } = await supabase
    .from("project_proposals")
    .select("id, name, status, skills, proposed_team, estimated_hours_per_week, tenant_id")
    .eq("id", proposalId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (proposalError || !proposal) return { error: "Proposal not found" };
  if (proposal.status !== "won") {
    return { error: "Only proposals with status 'Won' can be converted to a project" };
  }

  const officeScope = overrides.office_scope?.length ? overrides.office_scope : null;

  if (officeScope) {
    const { data: offices, error: officesError } = await supabase
      .from("offices")
      .select("id")
      .eq("tenant_id", user.tenantId)
      .in("id", officeScope);
    if (officesError) return { error: officesError.message };
    if ((offices ?? []).length !== officeScope.length) {
      return { error: "One or more selected offices are invalid." };
    }
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      tenant_id: user.tenantId,
      name: overrides.name.trim(),
      client_name: overrides.client_name?.trim() || null,
      estimated_hours: overrides.estimated_hours ?? null,
      start_date: overrides.start_date || null,
      end_date: overrides.end_date || null,
      status: "active",
      office_scope: officeScope,
      notes: overrides.notes?.trim() || null,
      source_proposal_id: proposalId,
    })
    .select("id")
    .single();

  if (projectError || !project) return { error: projectError?.message ?? "Failed to create project" };

  const skills: Array<{ id: string; name: string; required_hours_per_week?: number }> =
    overrides.skills ?? (Array.isArray(proposal.skills) ? proposal.skills : []);

  if (skills.length > 0) {
    const skillRows = skills
      .filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          (s.required_hours_per_week === undefined || s.required_hours_per_week >= 0)
      )
      .map((s) => ({
        project_id: project.id,
        skill_id: s.id,
        required_hours_per_week: s.required_hours_per_week ?? 0,
        tenant_id: user.tenantId,
      }));

    if (skillRows.length > 0) {
      const { error: skillsError } = await supabase
        .from("project_skill_requirements")
        .insert(skillRows);
      if (skillsError) return { error: skillsError.message };
    }
  }

  // Create project assignments from the saved staffing plan if provided.
  if (overrides.team_assignments && overrides.team_assignments.length > 0) {
    const validAssignments = overrides.team_assignments.filter(
      (a) =>
        typeof a.staff_id === "string" &&
        a.staff_id.length > 0 &&
        typeof a.allocation_percentage === "number" &&
        a.allocation_percentage >= 0 &&
        typeof a.weekly_hours_allocated === "number" &&
        a.weekly_hours_allocated >= 0
    );

    if (validAssignments.length > 0) {
      const assignmentRows = validAssignments.map((a) => ({
        project_id: project.id,
        staff_id: a.staff_id,
        tenant_id: user.tenantId,
        allocation_percentage: Math.round(Math.min(200, a.allocation_percentage) * 10) / 10,
        weekly_hours_allocated: Math.round(a.weekly_hours_allocated * 10) / 10,
        week_start: null,
      }));

      const { error: assignmentsError } = await supabase
        .from("project_assignments")
        .insert(assignmentRows);
      // Non-fatal: log but don't fail the conversion if assignments can't be created
      if (assignmentsError) {
        console.warn("Failed to create team assignments during conversion:", assignmentsError.message);
      }
    }
  }

  const { error: updateError } = await supabase
    .from("project_proposals")
    .update({ status: "converted", updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("tenant_id", user.tenantId);

  if (updateError) return { error: updateError.message };

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "proposal.converted",
    entityType: "proposal",
    entityId: proposalId,
    newValue: { converted_to_project_id: project.id, project_name: overrides.name },
  });

  return { success: true, id: project.id };
}

export async function updateProposalStatus(
  id: string,
  newStatus: "draft" | "submitted" | "won" | "lost"
) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "proposals:manage")) {
    return { error: "You do not have permission to edit proposals" };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("project_proposals")
    .select("status, proposed_start_date, proposed_end_date")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (existingError || !existing) return { error: "Proposal not found" };

  if (existing.status === "converted") {
    return { error: "Converted proposals cannot have their status changed" };
  }

  if (existing.status === "draft" && newStatus !== "draft") {
    if (!existing.proposed_start_date || !existing.proposed_end_date) {
      return { error: "Set both timeline dates before changing status from draft" };
    }
  }

  const { error } = await supabase
    .from("project_proposals")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/dashboard");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "proposal.updated",
    entityType: "proposal",
    entityId: id,
    newValue: { status: newStatus },
  });
  return { success: true };
}

export async function deleteProposal(id: string) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "proposals:manage")) {
    return { error: "You do not have permission to delete proposals" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_proposals")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/proposals");
  revalidatePath("/dashboard");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "proposal.deleted",
    entityType: "proposal",
    entityId: id,
  });
  return { success: true };
}

export async function saveProposedTeam(
  proposalId: string,
  team: ProposedTeamMember[]
) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "proposals:manage")) {
    return { error: "You do not have permission to edit proposals" };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("project_proposals")
    .select("id, status")
    .eq("id", proposalId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (fetchError || !existing) return { error: "Proposal not found" };
  if (existing.status === "converted") {
    return { error: "Cannot edit a converted proposal" };
  }

  const sanitized = team
    .filter(
      (m) =>
        typeof m.staff_id === "string" &&
        m.staff_id.length > 0 &&
        typeof m.split_percent === "number" &&
        m.split_percent >= 0 &&
        m.split_percent <= 100
    )
    .map((m) => ({
      staff_id: m.staff_id,
      split_percent: Math.round(m.split_percent * 10) / 10,
    }));

  const { error } = await supabase
    .from("project_proposals")
    .update({ proposed_team: sanitized.length > 0 ? sanitized : null, updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };

  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

export type ProposedTeamMemberWithDetails = {
  staff_id: string;
  split_percent: number;
  name: string;
  role: string;
  office: string;
  weekly_capacity_hours: number;
  available_hours: number;
  matching_skill_names: string[];
  can_cover: boolean;
  overby_hours: number;
};

export type ProposedTeamCapacityResult = {
  members: ProposedTeamMemberWithDetails[];
  required_skills: Array<{ id: string; name: string; required_hours_per_week?: number }>;
  covered_skill_ids: string[];
  total_required_hours: number;
  total_assigned_hours: number;
  split_total: number;
  split_valid: boolean;
  all_skills_covered: boolean;
  estimated_hours_per_week: number | null;
};

export async function getProposedTeamWithCapacity(
  proposalId: string
): Promise<ProposedTeamCapacityResult | { error: string }> {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };

  const supabase = await createClient();

  const { data: proposal, error: proposalError } = await supabase
    .from("project_proposals")
    .select(
      "proposed_team, skills, estimated_hours, estimated_hours_per_week, proposed_start_date, proposed_end_date, office_scope"
    )
    .eq("id", proposalId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (proposalError || !proposal) return { error: "Proposal not found" };

  const rawTeam = Array.isArray(proposal.proposed_team)
    ? (proposal.proposed_team as unknown[]).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const m = entry as { staff_id?: unknown; split_percent?: unknown };
        if (typeof m.staff_id !== "string" || typeof m.split_percent !== "number") return [];
        return [{ staff_id: m.staff_id, split_percent: m.split_percent }];
      })
    : [];

  const requiredSkills: Array<{ id: string; name: string; required_hours_per_week?: number }> =
    Array.isArray(proposal.skills)
      ? (proposal.skills as unknown[]).flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const s = entry as { id?: unknown; name?: unknown; required_hours_per_week?: unknown };
          if (typeof s.id !== "string" || typeof s.name !== "string") return [];
          return [
            {
              id: s.id,
              name: s.name,
              ...(typeof s.required_hours_per_week === "number"
                ? { required_hours_per_week: s.required_hours_per_week }
                : {}),
            },
          ];
        })
      : [];

  if (rawTeam.length === 0) {
    return {
      members: [],
      required_skills: requiredSkills,
      covered_skill_ids: [],
      total_required_hours: proposal.estimated_hours ?? 0,
      total_assigned_hours: 0,
      split_total: 0,
      split_valid: false,
      all_skills_covered: requiredSkills.length === 0,
      estimated_hours_per_week: proposal.estimated_hours_per_week ?? null,
    };
  }

  const staffIds = rawTeam.map((m) => m.staff_id);

  const { data: staffRows } = await supabase
    .from("staff_profiles")
    .select("id, weekly_capacity_hours, users!inner(name, email, role, office_id, offices(name))")
    .eq("tenant_id", user.tenantId)
    .in("id", staffIds);

  const requiredSkillIds = requiredSkills.map((s) => s.id);
  const { data: staffSkillRows } =
    requiredSkillIds.length > 0
      ? await supabase
          .from("staff_skills")
          .select("staff_id, skill_id")
          .eq("tenant_id", user.tenantId)
          .in("staff_id", staffIds)
          .in("skill_id", requiredSkillIds)
      : { data: [] };

  const skillIdsByStaff = new Map<string, Set<string>>();
  for (const row of staffSkillRows ?? []) {
    if (!skillIdsByStaff.has(row.staff_id)) skillIdsByStaff.set(row.staff_id, new Set());
    skillIdsByStaff.get(row.staff_id)!.add(row.skill_id);
  }

  // Compute total available hours across proposal window using approved leave + assignments
  const proposalStart = proposal.proposed_start_date;
  const proposalEnd = proposal.proposed_end_date;
  const availableByStaff = new Map<string, number>();

  if (proposalStart && proposalEnd) {
    const { data: assignmentRows } = await supabase
      .from("project_assignments")
      .select("staff_id, weekly_hours_allocated, week_start, projects(start_date, end_date, status)")
      .eq("tenant_id", user.tenantId)
      .in("staff_id", staffIds);

    const { data: leaveRows } = await supabase
      .from("leave_requests")
      .select("staff_id, start_date, end_date")
      .eq("tenant_id", user.tenantId)
      .eq("status", "approved")
      .in("staff_id", staffIds)
      .lte("start_date", proposalEnd)
      .gte("end_date", proposalStart);

    // Count total working days in proposal window
    const startDate = new Date(proposalStart + "T00:00:00Z");
    const endDate = new Date(proposalEnd + "T00:00:00Z");
    let totalWorkDays = 0;
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dow = cursor.getUTCDay();
      if (dow >= 1 && dow <= 5) totalWorkDays++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const totalWeeks = totalWorkDays / 5;

    for (const sp of staffRows ?? []) {
      const weeklyCapacity = Number(sp.weekly_capacity_hours);
      const totalCapacity = weeklyCapacity * totalWeeks;

      // Sum committed hours from existing project assignments
      let committedHours = 0;
      for (const assignment of assignmentRows ?? []) {
        if (assignment.staff_id !== sp.id) continue;
        const proj = Array.isArray(assignment.projects) ? assignment.projects[0] : assignment.projects;
        if (!proj || proj.status !== "active") continue;
        const pStart = proj.start_date ? new Date(proj.start_date + "T00:00:00Z") : null;
        const pEnd = proj.end_date ? new Date(proj.end_date + "T00:00:00Z") : null;
        if (!pStart || !pEnd) continue;
        const overlapStart = pStart > startDate ? pStart : startDate;
        const overlapEnd = pEnd < endDate ? pEnd : endDate;
        if (overlapStart > overlapEnd) continue;
        let overlapDays = 0;
        const oc = new Date(overlapStart);
        while (oc <= overlapEnd) {
          const dow = oc.getUTCDay();
          if (dow >= 1 && dow <= 5) overlapDays++;
          oc.setUTCDate(oc.getUTCDate() + 1);
        }
        const overlapWeeks = overlapDays / 5;
        committedHours += Number(assignment.weekly_hours_allocated) * overlapWeeks;
      }

      // Subtract approved leave
      let leaveHours = 0;
      const dailyCapacity = weeklyCapacity / 5;
      for (const leave of leaveRows ?? []) {
        if (leave.staff_id !== sp.id) continue;
        const ls = new Date(leave.start_date + "T00:00:00Z");
        const le = new Date(leave.end_date + "T00:00:00Z");
        const overlapStart = ls > startDate ? ls : startDate;
        const overlapEnd = le < endDate ? le : endDate;
        if (overlapStart > overlapEnd) continue;
        let leaveDays = 0;
        const lc = new Date(overlapStart);
        while (lc <= overlapEnd) {
          const dow = lc.getUTCDay();
          if (dow >= 1 && dow <= 5) leaveDays++;
          lc.setUTCDate(lc.getUTCDate() + 1);
        }
        leaveHours += leaveDays * dailyCapacity;
      }

      const available = Math.max(0, totalCapacity - committedHours - leaveHours);
      availableByStaff.set(sp.id, Math.round(available * 10) / 10);
    }
  }

  const staffById = new Map(
    (staffRows ?? []).map((row) => {
      const userRecord = Array.isArray(row.users) ? row.users[0] : row.users;
      const officeRecord = Array.isArray(userRecord?.offices)
        ? userRecord.offices[0]
        : userRecord?.offices;
      return [
        row.id,
        {
          name: (userRecord as { name?: string | null })?.name?.trim() || (userRecord as { email?: string })?.email || "Unknown",
          role: (userRecord as { role?: string })?.role ?? "staff",
          office: (officeRecord as { name?: string })?.name ?? "No office",
          weekly_capacity_hours: Number(row.weekly_capacity_hours),
        },
      ];
    })
  );

  const totalRequired = proposal.estimated_hours ?? 0;
  const splitTotal = rawTeam.reduce((sum, m) => sum + m.split_percent, 0);
  const splitValid = Math.abs(splitTotal - 100) < 0.1 || rawTeam.length === 0;

  const members: ProposedTeamMemberWithDetails[] = rawTeam.map((m) => {
    const staff = staffById.get(m.staff_id);
    const available = availableByStaff.get(m.staff_id) ?? 0;
    const assignedHours = Math.round((totalRequired * m.split_percent) / 100 * 10) / 10;
    const spare = Math.round((available - assignedHours) * 10) / 10;
    const matchingSkillIds = skillIdsByStaff.get(m.staff_id) ?? new Set<string>();
    const matchingSkillNames = requiredSkills
      .filter((s) => matchingSkillIds.has(s.id))
      .map((s) => s.name);
    return {
      staff_id: m.staff_id,
      split_percent: m.split_percent,
      name: staff?.name ?? "Unknown staff",
      role: staff?.role ?? "staff",
      office: staff?.office ?? "No office",
      weekly_capacity_hours: staff?.weekly_capacity_hours ?? 0,
      available_hours: available,
      matching_skill_names: matchingSkillNames,
      can_cover: spare >= 0,
      overby_hours: spare < 0 ? Math.abs(spare) : 0,
    };
  });

  const coveredSkillIds = Array.from(
    new Set(members.flatMap((m) => {
      const skillIds = skillIdsByStaff.get(m.staff_id) ?? new Set<string>();
      return Array.from(skillIds);
    }))
  );
  const allSkillsCovered = requiredSkills.every((s) => coveredSkillIds.includes(s.id));
  const totalAssigned = Math.round(members.reduce((sum, m) => sum + (totalRequired * m.split_percent) / 100, 0) * 10) / 10;

  return {
    members,
    required_skills: requiredSkills,
    covered_skill_ids: coveredSkillIds,
    total_required_hours: totalRequired,
    total_assigned_hours: totalAssigned,
    split_total: Math.round(splitTotal * 10) / 10,
    split_valid: splitValid,
    all_skills_covered: allSkillsCovered,
    estimated_hours_per_week: proposal.estimated_hours_per_week ?? null,
  };
}
