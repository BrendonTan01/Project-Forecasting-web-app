"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export type ProposalFormData = {
  name: string;
  client_name?: string;
  proposed_start_date?: string;
  proposed_end_date?: string;
  estimated_hours?: number;
  estimated_hours_per_week?: number;
  office_scope?: string[] | null;
  status: "draft" | "submitted" | "won" | "lost";
  notes?: string;
};

export async function createProposal(data: ProposalFormData) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can create proposals" };
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
      office_scope: data.office_scope?.length ? data.office_scope : null,
      status: data.status,
      notes: data.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/proposals");
  revalidatePath("/dashboard");
  return { success: true, id: proposal.id };
}

export async function updateProposal(id: string, data: Partial<ProposalFormData>) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can edit proposals" };
  }

  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.client_name !== undefined) updateData.client_name = data.client_name?.trim() || null;
  if (data.proposed_start_date !== undefined) updateData.proposed_start_date = data.proposed_start_date || null;
  if (data.proposed_end_date !== undefined) updateData.proposed_end_date = data.proposed_end_date || null;
  if (data.estimated_hours !== undefined) updateData.estimated_hours = data.estimated_hours ?? null;
  if (data.estimated_hours_per_week !== undefined) updateData.estimated_hours_per_week = data.estimated_hours_per_week ?? null;
  if ("office_scope" in data) updateData.office_scope = data.office_scope?.length ? data.office_scope : null;
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
  return { success: true };
}

export async function deleteProposal(id: string) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can delete proposals" };
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
  return { success: true };
}
