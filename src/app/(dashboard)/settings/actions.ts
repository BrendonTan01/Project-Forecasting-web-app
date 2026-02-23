"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant, getCurrentStaffId } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";

export type ProfileFormData = {
  job_title: string | null;
  office_id: string | null;
  weekly_capacity_hours: number;
  billable_rate: number | null;
  cost_rate: number | null;
};

export async function updateProfileSettings(data: ProfileFormData) {
  const user = await getCurrentUserWithTenant();
  const staffId = await getCurrentStaffId();
  if (!user || !staffId) {
    return { error: "Unauthorized" };
  }

  const supabase = await createClient();

  // Validate weekly_capacity_hours
  const capacity = data.weekly_capacity_hours;
  if (capacity <= 0 || capacity > 168) {
    return { error: "Weekly capacity must be between 0.5 and 168 hours" };
  }

  // Update users.office_id (role is never sent - protected by DB trigger)
  const { error: userError } = await supabase
    .from("users")
    .update({ office_id: data.office_id || null })
    .eq("id", user.id);

  if (userError) return { error: userError.message };

  // Update staff_profiles
  const staffUpdate: Record<string, unknown> = {
    job_title: data.job_title?.trim() || null,
    weekly_capacity_hours: capacity,
    billable_rate: data.billable_rate != null && data.billable_rate > 0 ? data.billable_rate : null,
    cost_rate: data.cost_rate != null && data.cost_rate > 0 ? data.cost_rate : null,
  };

  const { error: staffError } = await supabase
    .from("staff_profiles")
    .update(staffUpdate)
    .eq("id", staffId);

  if (staffError) return { error: staffError.message };

  revalidatePath("/settings");
  revalidatePath("/staff");
  revalidatePath("/dashboard");
  return { success: true };
}
