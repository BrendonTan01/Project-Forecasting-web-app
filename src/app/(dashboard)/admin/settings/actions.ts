"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";

type OrgSettingsData = {
  name: string;
  industry?: string;
  default_currency?: string;
  planning_hours_per_person_per_week?: number;
};

export async function updateOrgSettings(data: OrgSettingsData) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can update organisation settings." };
  }

  if (!data.name?.trim()) return { error: "Organisation name is required." };
  const planningHours = Number(data.planning_hours_per_person_per_week ?? 40);
  if (!Number.isFinite(planningHours) || planningHours <= 0 || planningHours > 168) {
    return { error: "Planning hours per person must be between 0.5 and 168." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("tenants")
    .update({
      name: data.name.trim(),
      industry: data.industry?.trim() || null,
      default_currency: data.default_currency?.trim() || "USD",
      planning_hours_per_person_per_week: planningHours,
    })
    .eq("id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { success: true };
}
