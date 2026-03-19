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
    .select("id, name, status, skills, tenant_id")
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
    Array.isArray(proposal.skills) ? proposal.skills : [];

  if (skills.length > 0) {
    const skillRows = skills
      .filter((s) => s && typeof s.id === "string")
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
