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
  expected_revenue?: number;
  manual_estimated_cost?: number;
  derived_estimated_cost_override?: number;
  risk_allowance_amount?: number;
  win_probability_percent?: number;
  schedule_confidence_percent?: number;
  cross_office_dependency_percent?: number;
  client_quality_score?: number;
  cost_source_preference: "manual_first" | "derived_first";
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
      expected_revenue: data.expected_revenue ?? null,
      manual_estimated_cost: data.manual_estimated_cost ?? null,
      derived_estimated_cost_override: data.derived_estimated_cost_override ?? null,
      risk_allowance_amount: data.risk_allowance_amount ?? null,
      win_probability_percent: data.win_probability_percent ?? null,
      schedule_confidence_percent: data.schedule_confidence_percent ?? null,
      cross_office_dependency_percent: data.cross_office_dependency_percent ?? null,
      client_quality_score: data.client_quality_score ?? null,
      cost_source_preference: data.cost_source_preference,
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
  if (data.estimated_hours !== undefined) updateData.estimated_hours = data.estimated_hours;
  if (data.expected_revenue !== undefined) updateData.expected_revenue = data.expected_revenue;
  if (data.manual_estimated_cost !== undefined) updateData.manual_estimated_cost = data.manual_estimated_cost;
  if (data.derived_estimated_cost_override !== undefined) {
    updateData.derived_estimated_cost_override = data.derived_estimated_cost_override;
  }
  if (data.risk_allowance_amount !== undefined) updateData.risk_allowance_amount = data.risk_allowance_amount;
  if (data.win_probability_percent !== undefined) updateData.win_probability_percent = data.win_probability_percent;
  if (data.schedule_confidence_percent !== undefined) {
    updateData.schedule_confidence_percent = data.schedule_confidence_percent;
  }
  if (data.cross_office_dependency_percent !== undefined) {
    updateData.cross_office_dependency_percent = data.cross_office_dependency_percent;
  }
  if (data.client_quality_score !== undefined) updateData.client_quality_score = data.client_quality_score;
  if (data.cost_source_preference !== undefined) {
    updateData.cost_source_preference = data.cost_source_preference;
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
