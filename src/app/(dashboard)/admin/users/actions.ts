"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit/log";

export async function changeUserRole(
  userId: string,
  newRole: "staff" | "manager" | "administrator"
) {
  const currentUser = await getCurrentUserWithTenant();
  if (!currentUser) return { error: "Unauthorized" };
  if (currentUser.role !== "administrator") {
    return { error: "Only administrators can change user roles." };
  }
  if (currentUser.id === userId) {
    return { error: "You cannot change your own role." };
  }

  const admin = createAdminClient();

  // Update via admin client to bypass the prevent_role_change trigger
  // (which only blocks non-administrator callers — service role bypasses RLS entirely)
  const { error } = await admin
    .from("users")
    .update({ role: newRole })
    .eq("id", userId)
    .eq("tenant_id", currentUser.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    action: "user.role_changed",
    entityType: "user",
    entityId: userId,
    newValue: { role: newRole },
  });
  return { success: true };
}

export async function deactivateUser(userId: string) {
  const currentUser = await getCurrentUserWithTenant();
  if (!currentUser) return { error: "Unauthorized" };
  if (currentUser.role !== "administrator") {
    return { error: "Only administrators can deactivate users." };
  }
  if (currentUser.id === userId) {
    return { error: "You cannot deactivate your own account." };
  }

  // Verify the user belongs to this tenant
  const supabase = await createClient();
  const { data: targetUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", currentUser.tenantId)
    .single();

  if (!targetUser) return { error: "User not found." };

  const admin = createAdminClient();

  // Ban the user in Supabase Auth (they cannot sign in but data is preserved)
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h", // ~100 years
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    action: "user.deactivated",
    entityType: "user",
    entityId: userId,
  });
  return { success: true };
}

export async function reactivateUser(userId: string) {
  const currentUser = await getCurrentUserWithTenant();
  if (!currentUser) return { error: "Unauthorized" };
  if (currentUser.role !== "administrator") {
    return { error: "Only administrators can reactivate users." };
  }

  const supabase = await createClient();
  const { data: targetUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", currentUser.tenantId)
    .single();

  if (!targetUser) return { error: "User not found." };

  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    action: "user.reactivated",
    entityType: "user",
    entityId: userId,
  });
  return { success: true };
}
