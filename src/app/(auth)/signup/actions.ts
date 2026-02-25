"use server";

import { createClient } from "@/lib/supabase/server";

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

  // Validate the tenant exists before attaching metadata.
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
    options: {
      data: metadata,
    },
  });

  if (error) return { error: error.message };
  return { success: true };
}
