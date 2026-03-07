"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";

export async function upsertProjectAssignment(
  projectId: string,
  staffId: string,
  allocationPercentage: number
) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can manage project assignments." };
  }
  if (allocationPercentage < 0 || allocationPercentage > 200) {
    return { error: "Allocation must be between 0% and 200%." };
  }

  const supabase = await createClient();

  // Verify the project belongs to this tenant
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!project) return { error: "Project not found." };

  // Verify the staff member belongs to this tenant
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("id", staffId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!staff) return { error: "Staff member not found." };

  const { error } = await supabase
    .from("project_assignments")
    .upsert(
      {
        tenant_id: user.tenantId,
        project_id: projectId,
        staff_id: staffId,
        allocation_percentage: allocationPercentage,
      },
      { onConflict: "project_id,staff_id" }
    );

  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/assignments`);
  revalidatePath("/capacity");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function removeProjectAssignment(projectId: string, assignmentId: string) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can manage project assignments." };
  }

  const supabase = await createClient();

  // Verify the project belongs to this tenant before deleting
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!project) return { error: "Project not found." };

  const { error } = await supabase
    .from("project_assignments")
    .delete()
    .eq("tenant_id", user.tenantId)
    .eq("id", assignmentId)
    .eq("project_id", projectId);

  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/assignments`);
  revalidatePath("/capacity");
  revalidatePath("/dashboard");
  return { success: true };
}
