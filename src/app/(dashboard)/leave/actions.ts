"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant, getCurrentStaffId } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit/log";

// ─── Create a leave request (any authenticated user) ──────────────────────────

type CreateLeaveInput = {
  startDate: string;
  endDate: string;
  leaveType: "annual" | "sick";
};

export async function createLeaveRequest(input: CreateLeaveInput) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };

  const staffId = await getCurrentStaffId();
  if (!staffId) return { error: "Staff profile not found." };

  const { startDate, endDate, leaveType } = input;

  if (!startDate || !endDate) return { error: "Start and end dates are required." };
  if (new Date(endDate) < new Date(startDate)) {
    return { error: "End date cannot be before start date." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("leave_requests").insert({
    tenant_id: user.tenantId,
    staff_id: staffId,
    start_date: startDate,
    end_date: endDate,
    leave_type: leaveType,
    status: "pending",
  });

  if (error) return { error: error.message };
  revalidatePath("/leave");
  revalidatePath("/capacity-planner");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "leave_request.created",
    entityType: "leave_request",
    newValue: { start_date: startDate, end_date: endDate, leave_type: leaveType },
  });
  return { success: true };
}

// ─── Approve or reject a leave request (manager / administrator) ───────────────

export async function updateLeaveRequestStatus(
  leaveRequestId: string,
  status: "approved" | "rejected"
) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };
  if (user.role === "staff") {
    return { error: "Only managers and administrators can approve leave requests." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("leave_requests")
    .update({ status })
    .eq("id", leaveRequestId)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/leave");
  revalidatePath("/capacity-planner");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "leave_request.status_changed",
    entityType: "leave_request",
    entityId: leaveRequestId,
    newValue: { status },
  });
  return { success: true };
}

// ─── Delete a leave request (own pending requests only, or admin) ──────────────

export async function deleteLeaveRequest(leaveRequestId: string) {
  const user = await getCurrentUserWithTenant();
  if (!user) return { error: "Unauthorized" };

  const supabase = await createClient();

  const { data: leaveRequest } = await supabase
    .from("leave_requests")
    .select("id, staff_id, status")
    .eq("id", leaveRequestId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!leaveRequest) return { error: "Leave request not found." };

  const staffId = await getCurrentStaffId();

  // Staff can only delete their own pending requests
  if (user.role === "staff") {
    if (leaveRequest.staff_id !== staffId) {
      return { error: "You can only delete your own leave requests." };
    }
    if (leaveRequest.status !== "pending") {
      return { error: "Only pending requests can be deleted." };
    }
  }

  const { error } = await supabase
    .from("leave_requests")
    .delete()
    .eq("id", leaveRequestId)
    .eq("tenant_id", user.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/leave");
  revalidatePath("/capacity-planner");
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "leave_request.deleted",
    entityType: "leave_request",
    entityId: leaveRequestId,
  });
  return { success: true };
}
