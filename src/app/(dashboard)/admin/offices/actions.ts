"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";

type OfficeFormData = {
  name: string;
  country: string;
  timezone: string;
  weekly_working_hours: number;
};

export async function createOffice(data: OfficeFormData) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can manage offices." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("offices").insert({
    tenant_id: user.tenantId,
    name: data.name.trim(),
    country: data.country.trim(),
    timezone: data.timezone.trim(),
    weekly_working_hours: data.weekly_working_hours,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/offices");
  revalidatePath("/settings");
  return { success: true };
}

export async function updateOffice(officeId: string, data: Partial<OfficeFormData>) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can manage offices." };
  }

  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.country !== undefined) updateData.country = data.country.trim();
  if (data.timezone !== undefined) updateData.timezone = data.timezone.trim();
  if (data.weekly_working_hours !== undefined) {
    updateData.weekly_working_hours = data.weekly_working_hours;
  }

  const { error } = await supabase
    .from("offices")
    .update(updateData)
    .eq("id", officeId)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/admin/offices");
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteOffice(officeId: string) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can manage offices." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("offices")
    .delete()
    .eq("id", officeId)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/admin/offices");
  revalidatePath("/settings");
  return { success: true };
}
