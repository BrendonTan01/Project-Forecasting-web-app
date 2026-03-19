"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit/log";
import {
  scheduleForecastRecalculation,
  scheduleHiringPredictionsRecalculation,
} from "@/lib/forecast/engine";

export type ProjectFormData = {
  name: string;
  client_name?: string;
  estimated_hours?: number;
  start_date?: string;
  end_date?: string;
  status: string;
  office_scope?: string[] | null;
  notes?: string;
  source_proposal_id?: string | null;
};

export async function createProject(data: ProjectFormData) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "projects:manage")) {
    return { error: "You do not have permission to create projects" };
  }

  const supabase = await createClient();
  const officeScope = data.office_scope?.length ? data.office_scope : null;

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

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      tenant_id: user.tenantId,
      name: data.name.trim(),
      client_name: data.client_name?.trim() || null,
      estimated_hours: data.estimated_hours ?? null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      status: data.status || "active",
      office_scope: officeScope,
      notes: data.notes?.trim() || null,
      source_proposal_id: data.source_proposal_id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "project.created",
    entityType: "project",
    entityId: project.id,
    newValue: { name: data.name, status: data.status },
  });
  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);
  return { success: true, id: project.id };
}

export async function updateProject(id: string, data: Partial<ProjectFormData>) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "projects:manage")) {
    return { error: "You do not have permission to edit projects" };
  }

  const supabase = await createClient();
  const officeScope =
    "office_scope" in data ? (data.office_scope?.length ? data.office_scope : null) : undefined;

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

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.client_name !== undefined) updateData.client_name = data.client_name?.trim() || null;
  if (data.estimated_hours !== undefined) updateData.estimated_hours = data.estimated_hours;
  if (data.start_date !== undefined) updateData.start_date = data.start_date || null;
  if (data.end_date !== undefined) updateData.end_date = data.end_date || null;
  if (data.status !== undefined) updateData.status = data.status;
  if (officeScope !== undefined) updateData.office_scope = officeScope;
  if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;

  const { error } = await supabase
    .from("projects")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/dashboard");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "project.updated",
    entityType: "project",
    entityId: id,
    newValue: updateData,
  });
  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);
  return { success: true };
}

export async function deleteProject(id: string) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (!hasPermission(user.role, "projects:manage")) {
    return { error: "You do not have permission to delete projects" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "project.deleted",
    entityType: "project",
    entityId: id,
  });
  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);
  return { success: true };
}
