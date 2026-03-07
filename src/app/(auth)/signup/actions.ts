"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Join existing org (staff invite-code path) ──────────────────────────────

type SignupInput = {
  email: string;
  password: string;
  companyId: string;
  jobTitle?: string;
  weeklyCapacityHours?: number;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function signupAction(input: SignupInput) {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const companyId = input.companyId.trim();
  const jobTitle = input.jobTitle?.trim();
  const weeklyCapacityHours = input.weeklyCapacityHours;

  if (!email || !password || !companyId) {
    return { error: "Email, password, and company ID are required." };
  }
  if (!isUuid(companyId)) {
    return { error: "Company ID must be a valid UUID." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (
    weeklyCapacityHours !== undefined &&
    (weeklyCapacityHours <= 0 || weeklyCapacityHours > 168)
  ) {
    return { error: "Weekly capacity must be between 0.5 and 168 hours." };
  }

  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();

  if (!tenant) {
    return {
      error:
        "Company ID not recognized. Ask your administrator for the correct ID.",
    };
  }

  const metadata: Record<string, string | number> = {
    tenant_id: companyId,
    role: "staff",
  };
  if (jobTitle) metadata.job_title = jobTitle;
  if (weeklyCapacityHours !== undefined) {
    metadata.weekly_capacity_hours = weeklyCapacityHours;
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });

  if (error) return { error: error.message };
  return { success: true };
}

// ─── Create new organisation (self-service onboarding) ────────────────────────

type CreateOrgInput = {
  orgName: string;
  email: string;
  password: string;
  jobTitle?: string;
};

export async function createTenantAndAdmin(input: CreateOrgInput) {
  const orgName = input.orgName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const jobTitle = input.jobTitle?.trim();

  if (!orgName) return { error: "Organisation name is required." };
  if (!email) return { error: "Email is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const admin = createAdminClient();

  // 1. Create the tenant row
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ name: orgName })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    return { error: tenantError?.message ?? "Failed to create organisation." };
  }

  const tenantId = tenant.id;

  // 2. Create the Supabase auth user with administrator role
  //    The handle_new_user() trigger will create the users + staff_profiles rows.
  //    Service-role callers are allowed to set elevated roles and rates.
  const metadata: Record<string, string> = {
    tenant_id: tenantId,
    role: "administrator",
  };
  if (jobTitle) metadata.job_title = jobTitle;

  const { data: authUser, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

  if (authError || !authUser) {
    // Roll back the tenant row so we don't leave orphaned tenants
    await admin.from("tenants").delete().eq("id", tenantId);
    return {
      error: authError?.message ?? "Failed to create administrator account.",
    };
  }

  return { success: true, tenantId };
}
