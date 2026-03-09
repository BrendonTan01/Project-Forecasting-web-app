"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserWithTenant, getStaffIdByUserId } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";
import {
  scheduleForecastRecalculation,
  scheduleHiringPredictionsRecalculation,
} from "@/lib/forecast/engine";

export type ProfileFormData = {
  job_title: string | null;
  office_id: string | null;
  weekly_capacity_hours: number;
  billable_rate?: number | null;
  cost_rate?: number | null;
};

export async function updateProfileSettings(data: ProfileFormData) {
  const user = await getCurrentUserWithTenant();
  const staffId = user ? await getStaffIdByUserId(user.id, user.tenantId) : null;
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
    .eq("id", user.id)
    .eq("tenant_id", user.tenantId);

  if (userError) return { error: userError.message };

  // Update staff_profiles (staff cannot update billable_rate/cost_rate)
  const staffUpdate: Record<string, unknown> = {
    job_title: data.job_title?.trim() || null,
    weekly_capacity_hours: capacity,
  };
  if (user.role !== "staff" && data.billable_rate !== undefined) {
    staffUpdate.billable_rate = data.billable_rate != null && data.billable_rate > 0 ? data.billable_rate : null;
  }
  if (user.role !== "staff" && data.cost_rate !== undefined) {
    staffUpdate.cost_rate = data.cost_rate != null && data.cost_rate > 0 ? data.cost_rate : null;
  }

  const { error: staffError } = await supabase
    .from("staff_profiles")
    .update(staffUpdate)
    .eq("id", staffId)
    .eq("tenant_id", user.tenantId);

  if (staffError) return { error: staffError.message };

  revalidatePath("/settings");
  revalidatePath("/staff");
  revalidatePath("/dashboard");
  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);
  return { success: true };
}

export type StaffCostUpdateData = {
  billable_rate?: number | null;
  cost_rate?: number | null;
};

function normalizeOptionalPositiveRate(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export async function updateManagedStaffCosts(staffId: string, data: StaffCostUpdateData) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role === "staff") return { error: "Forbidden" };
  if (!staffId) return { error: "Missing staff id" };

  const supabase = await createClient();
  const { data: targetProfile } = await supabase
    .from("staff_profiles")
    .select("id, user_id, users(role, office_id, email)")
    .eq("id", staffId)
    .eq("tenant_id", user.tenantId)
    .maybeSingle();

  if (!targetProfile) return { error: "Staff profile not found" };

  const relation = targetProfile.users as
    | { role: string; office_id: string | null; email?: string | null }
    | { role: string; office_id: string | null; email?: string | null }[]
    | null;
  const targetUser = Array.isArray(relation) ? relation[0] : relation;
  if (!targetUser) return { error: "User record not found" };

  const managerCanEdit =
    targetProfile.user_id === user.id ||
    (targetUser.role === "staff" &&
      user.officeId !== null &&
      targetUser.office_id !== null &&
      targetUser.office_id === user.officeId);
  const canEdit = user.role === "administrator" || (user.role === "manager" && managerCanEdit);

  if (!canEdit) return { error: "You can only edit your own or managed staff rates." };

  const updatePayload: Record<string, number | null> = {};
  const normalizedBillable = normalizeOptionalPositiveRate(data.billable_rate);
  const normalizedCost = normalizeOptionalPositiveRate(data.cost_rate);
  if (normalizedBillable !== undefined) updatePayload.billable_rate = normalizedBillable;
  if (normalizedCost !== undefined) updatePayload.cost_rate = normalizedCost;

  if (Object.keys(updatePayload).length === 0) {
    return { error: "No rate changes provided." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("staff_profiles")
    .update(updatePayload)
    .eq("id", staffId)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/staff");
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/projects");
  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);
  return { success: true };
}
