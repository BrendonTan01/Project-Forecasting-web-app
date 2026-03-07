"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

// ─── Send an invitation ───────────────────────────────────────────────────────

type SendInvitationInput = {
  email: string;
  role: "staff" | "manager" | "administrator";
};

export async function sendInvitation(input: SendInvitationInput) {
  const currentUser = await getCurrentUserWithTenant();
  if (!currentUser) return { error: "Unauthorized" };
  if (currentUser.role !== "administrator") {
    return { error: "Only administrators can send invitations." };
  }

  const email = input.email.trim().toLowerCase();
  const role = input.role;

  if (!email) return { error: "Email is required." };

  const supabase = await createClient();

  // Check no active invitation already exists for this email + tenant
  const { data: existing } = await supabase
    .from("invitations")
    .select("id, accepted_at, expires_at")
    .eq("tenant_id", currentUser.tenantId)
    .eq("email", email)
    .maybeSingle();

  if (existing && !existing.accepted_at && new Date(existing.expires_at) > new Date()) {
    return { error: "An active invitation already exists for this email address." };
  }

  // Generate a secure token (48 hex chars = 192 bits of entropy)
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const { error: insertError } = await supabase
    .from("invitations")
    .insert({
      tenant_id: currentUser.tenantId,
      email,
      role,
      token,
      expires_at: expiresAt.toISOString(),
      created_by: currentUser.id,
    });

  if (insertError) return { error: insertError.message };

  revalidatePath("/admin/users");

  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/invite/${token}`;
  return { success: true, inviteUrl, token };
}

// ─── Look up an invitation by token (public — pre-auth) ───────────────────────

export async function getInvitationByToken(token: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("invitations")
    .select("id, tenant_id, email, role, expires_at, accepted_at, tenants(name)")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return { error: "Invitation not found." };
  if (data.accepted_at) return { error: "This invitation has already been accepted." };
  if (new Date(data.expires_at) < new Date()) return { error: "This invitation has expired." };

  const tenantName =
    data.tenants && !Array.isArray(data.tenants)
      ? (data.tenants as { name: string }).name
      : Array.isArray(data.tenants)
        ? (data.tenants[0] as { name: string })?.name
        : null;

  return {
    invitation: {
      id: data.id,
      tenantId: data.tenant_id,
      email: data.email,
      role: data.role as "staff" | "manager" | "administrator",
      tenantName: tenantName ?? "Unknown Organisation",
    },
  };
}

// ─── Accept an invitation ─────────────────────────────────────────────────────

type AcceptInvitationInput = {
  token: string;
  password: string;
  jobTitle?: string;
  weeklyCapacityHours?: number;
};

export async function acceptInvitation(input: AcceptInvitationInput) {
  const { token, password, jobTitle, weeklyCapacityHours } = input;

  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const admin = createAdminClient();

  // Re-validate the token server-side
  const { data: invitation, error: lookupError } = await admin
    .from("invitations")
    .select("id, tenant_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (lookupError || !invitation) return { error: "Invitation not found." };
  if (invitation.accepted_at) return { error: "This invitation has already been accepted." };
  if (new Date(invitation.expires_at) < new Date()) return { error: "This invitation has expired." };

  const metadata: Record<string, string | number> = {
    tenant_id: invitation.tenant_id,
    role: invitation.role,
  };
  if (jobTitle?.trim()) metadata.job_title = jobTitle.trim();
  if (weeklyCapacityHours !== undefined && weeklyCapacityHours > 0) {
    metadata.weekly_capacity_hours = weeklyCapacityHours;
  }

  // Create the Supabase auth user — trigger handle_new_user() creates the DB rows
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (authError || !authUser) {
    return { error: authError?.message ?? "Failed to create account." };
  }

  // Mark the invitation as accepted
  await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  return { success: true, email: invitation.email };
}

// ─── Revoke an invitation (admin only) ────────────────────────────────────────

export async function revokeInvitation(invitationId: string) {
  const currentUser = await getCurrentUserWithTenant();
  if (!currentUser) return { error: "Unauthorized" };
  if (currentUser.role !== "administrator") {
    return { error: "Only administrators can revoke invitations." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .eq("tenant_id", currentUser.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { success: true };
}
