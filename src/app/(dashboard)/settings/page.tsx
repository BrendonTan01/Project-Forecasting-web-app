import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { hasPermission } from "@/lib/permissions";
import { ProfileSettingsForm } from "./ProfileSettingsForm";
import { CostRatesManager } from "./CostRatesManager";
import { getRelationOne } from "@/lib/utils/supabase-relations";
import { getStaffDisplayName } from "@/lib/utils/staffDisplay";

export default async function SettingsPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const canManageSkills = hasPermission(user.role, "assignments:manage");
  const canManageRates = user.role !== "staff";

  const { data: staffProfileBase } = await supabase
    .from("staff_profiles")
    .select("id, job_title, weekly_capacity_hours")
    .eq("user_id", user.id)
    .eq("tenant_id", user.tenantId)
    .single();

  const { data: ownRates } = canManageRates
    ? await supabase
        .from("staff_profiles")
        .select("billable_rate, cost_rate")
        .eq("user_id", user.id)
        .eq("tenant_id", user.tenantId)
        .single()
    : { data: null };

  const { data: offices } = await supabase
    .from("offices")
    .select("id, name, country")
    .eq("tenant_id", user.tenantId)
    .order("name");

  const { data: staffRates } = canManageRates
    ? await supabase
        .from("staff_profiles")
        .select("id, user_id, name, billable_rate, cost_rate, users(name, email, role, office_id, offices(name, country))")
        .eq("tenant_id", user.tenantId)
    : { data: null };

  const managedRateRows = (staffRates ?? [])
    .map((row) => {
      const u = getRelationOne((row as { users?: unknown }).users) as
        | { name?: string; email?: string; role: string; office_id: string | null; offices?: { name: string; country: string } | { name: string; country: string }[] | null }
        | null;
      const office = u?.offices ? (getRelationOne(u.offices) as { name: string; country: string } | null) : null;
      const profileName = (row as { name?: string | null }).name;
      return {
        staff_id: row.id,
        user_id: row.user_id,
        displayName: getStaffDisplayName(profileName, u),
        role: u?.role ?? "staff",
        office_id: u?.office_id ?? null,
        office_label: office ? `${office.name} (${office.country})` : "Unassigned",
        billable_rate: row.billable_rate as number | null,
        cost_rate: row.cost_rate as number | null,
      };
    })
    .filter((row) => {
      if (user.role === "administrator") return true;
      if (user.role !== "manager") return false;
      if (row.user_id === user.id) return true;
      return row.role === "staff" && row.office_id !== null && row.office_id === user.officeId;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="app-page-title">Profile settings</h1>
        {canManageSkills && (
          <Link
            href="/settings/skills"
            className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
          >
            Manage skill catalog
          </Link>
        )}
      </div>
      <p className="app-page-subtitle">
        Update your profile. Your role cannot be changed.
      </p>

      <ProfileSettingsForm
        initialData={{
          job_title: staffProfileBase?.job_title ?? "",
          office_id: user.officeId ?? "",
          weekly_capacity_hours: staffProfileBase?.weekly_capacity_hours ?? 40,
          billable_rate:
            user.role !== "staff"
              ? (ownRates?.billable_rate as number | null)?.toString() ?? ""
              : "",
          cost_rate:
            user.role !== "staff"
              ? (ownRates?.cost_rate as number | null)?.toString() ?? ""
              : "",
        }}
        role={user.role}
        offices={offices ?? []}
      />

      {canManageRates && <CostRatesManager rows={managedRateRows} />}
    </div>
  );
}
