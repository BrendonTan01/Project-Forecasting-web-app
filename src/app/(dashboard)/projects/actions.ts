"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";

export type ProjectFormData = {
  name: string;
  client_name?: string;
  estimated_hours?: number;
  start_date?: string;
  end_date?: string;
  status: string;
};

export async function createProject(data: ProjectFormData) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can create projects" };
  }

  const supabase = await createClient();

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
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { success: true, id: project.id };
}

export async function updateProject(id: string, data: Partial<ProjectFormData>) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can edit projects" };
  }

  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.client_name !== undefined) updateData.client_name = data.client_name?.trim() || null;
  if (data.estimated_hours !== undefined) updateData.estimated_hours = data.estimated_hours;
  if (data.start_date !== undefined) updateData.start_date = data.start_date || null;
  if (data.end_date !== undefined) updateData.end_date = data.end_date || null;
  if (data.status !== undefined) updateData.status = data.status;

  const { error } = await supabase
    .from("projects")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteProject(id: string) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can delete projects" };
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
  return { success: true };
}
