import { cache } from "react";
import { createClient } from "./server";

/**
 * Get current user and their tenant_id from the users table.
 * Used for tenant scoping in server components and actions.
 * Wrapped in React cache() to deduplicate calls within a single render pass
 * (e.g. layout + page both calling this will only hit Supabase once).
 */
export const getCurrentUserWithTenant = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: dbUser } = await supabase
    .from("users")
    .select("id, tenant_id, role, office_id")
    .eq("id", authUser.id)
    .single();

  if (!dbUser) return null;

  return {
    id: authUser.id,
    email: authUser.email ?? "",
    tenantId: dbUser.tenant_id,
    role: dbUser.role as "manager" | "staff" | "administrator",
    officeId: dbUser.office_id,
  };
});

/**
 * Get current user's staff_profile id (for time entries, etc.)
 */
export async function getCurrentStaffId() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  return getStaffIdByUserId(user.id);
}

export async function getStaffIdByUserId(userId: string) {
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  return data?.id ?? null;
}
