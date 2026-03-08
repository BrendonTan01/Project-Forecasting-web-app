"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";

type OrgSettingsData = {
  name: string;
  industry?: string;
  default_currency?: string;
};

export async function updateOrgSettings(data: OrgSettingsData) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "administrator") {
    return { error: "Only administrators can update organisation settings." };
  }

  if (!data.name?.trim()) return { error: "Organisation name is required." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("tenants")
    .update({
      name: data.name.trim(),
      industry: data.industry?.trim() || null,
      default_currency: data.default_currency?.trim() || "USD",
    })
    .eq("id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { success: true };
}
