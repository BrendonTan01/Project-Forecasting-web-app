"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant, getStaffIdByUserId } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";

export type TimeEntryFormData = {
  project_id: string;
  date: string;
  hours: number;
  billable_flag: boolean;
};

export async function createTimeEntry(data: TimeEntryFormData) {
  const user = await getCurrentUserWithTenant();
  const staffId = user ? await getStaffIdByUserId(user.id) : null;
  if (!user || !staffId) {
    return { error: "Unauthorized" };
  }

  const supabase = await createClient();

  // Validate: staff must be assigned to project (managers can bypass for now)
  const { data: assignment } = await supabase
    .from("project_assignments")
    .select("id")
    .eq("project_id", data.project_id)
    .eq("staff_id", staffId)
    .single();

  if (!assignment && user.role === "staff") {
    return { error: "You must be assigned to this project to log time" };
  }

  // Validate hours
  if (data.hours <= 0 || data.hours > 24) {
    return { error: "Hours must be between 0 and 24" };
  }

  const { data: existingEntry, error: existingError } = await supabase
    .from("time_entries")
    .select("id, hours, billable_flag")
    .eq("tenant_id", user.tenantId)
    .eq("staff_id", staffId)
    .eq("project_id", data.project_id)
    .eq("date", data.date)
    .eq("billable_flag", data.billable_flag)
    .maybeSingle();

  if (existingError) return { error: existingError.message };

  let error: { message: string } | null = null;

  if (existingEntry) {
    const mergedHours = Number(existingEntry.hours) + data.hours;
    if (mergedHours > 24) {
      return { error: "Total hours for this project/day must be 24 or less" };
    }

    const result = await supabase
      .from("time_entries")
      .update({
        hours: mergedHours,
      })
      .eq("id", existingEntry.id)
      .eq("tenant_id", user.tenantId);
    error = result.error;
  } else {
    const result = await supabase.from("time_entries").insert({
      tenant_id: user.tenantId,
      staff_id: staffId,
      project_id: data.project_id,
      date: data.date,
      hours: data.hours,
      billable_flag: data.billable_flag,
    });

    if ((result.error as { code?: string } | null)?.code === "23505") {
      // If another request inserted concurrently, merge into that row.
      const { data: concurrentEntry, error: concurrentError } = await supabase
        .from("time_entries")
        .select("id, hours, billable_flag")
        .eq("tenant_id", user.tenantId)
        .eq("staff_id", staffId)
        .eq("project_id", data.project_id)
        .eq("date", data.date)
        .eq("billable_flag", data.billable_flag)
        .maybeSingle();

      if (concurrentError) return { error: concurrentError.message };
      if (!concurrentEntry) return { error: result.error?.message ?? "Failed to save time entry" };

      const mergedHours = Number(concurrentEntry.hours) + data.hours;
      if (mergedHours > 24) {
        return { error: "Total hours for this project/day must be 24 or less" };
      }

      const retryResult = await supabase
        .from("time_entries")
        .update({
          hours: mergedHours,
        })
        .eq("id", concurrentEntry.id)
        .eq("tenant_id", user.tenantId);

      error = retryResult.error;
    } else {
      error = result.error;
    }
  }

  if (error) return { error: error.message };
  revalidatePath("/time-entry");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateTimeEntry(id: string, data: Partial<TimeEntryFormData>) {
  const user = await getCurrentUserWithTenant();
  const staffId = user ? await getStaffIdByUserId(user.id) : null;
  if (!user || !staffId) {
    return { error: "Unauthorized" };
  }

  const supabase = await createClient();

  // Staff can only update own entries
  const { data: existing } = await supabase
    .from("time_entries")
    .select("staff_id")
    .eq("id", id)
    .single();

  if (!existing) return { error: "Time entry not found" };
  if (user.role === "staff" && existing.staff_id !== staffId) {
    return { error: "Unauthorized" };
  }
  if (data.hours !== undefined && (data.hours <= 0 || data.hours > 24)) {
    return { error: "Hours must be between 0 and 24" };
  }

  const updateData: Record<string, unknown> = {};
  if (data.project_id !== undefined) updateData.project_id = data.project_id;
  if (data.date !== undefined) updateData.date = data.date;
  if (data.hours !== undefined) updateData.hours = data.hours;
  if (data.billable_flag !== undefined) updateData.billable_flag = data.billable_flag;

  const { error } = await supabase
    .from("time_entries")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/time-entry");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteTimeEntry(id: string) {
  const user = await getCurrentUserWithTenant();
  const staffId = user ? await getStaffIdByUserId(user.id) : null;
  if (!user || !staffId) {
    return { error: "Unauthorized" };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("time_entries")
    .select("staff_id")
    .eq("id", id)
    .single();

  if (!existing) return { error: "Time entry not found" };
  if (user.role === "staff" && existing.staff_id !== staffId) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/time-entry");
  revalidatePath("/dashboard");
  return { success: true };
}
