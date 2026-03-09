import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { hasPermission } from "@/lib/permissions";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export default async function SettingsPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const canManageSkills = hasPermission(user.role, "assignments:manage");

  const { data: staffProfile } = await supabase
    .from("staff_profiles")
    .select("id, job_title, weekly_capacity_hours, billable_rate, cost_rate")
    .eq("user_id", user.id)
    .eq("tenant_id", user.tenantId)
    .single();

  const { data: offices } = await supabase
    .from("offices")
    .select("id, name, country")
    .eq("tenant_id", user.tenantId)
    .order("name");

  return (
    <div className="mx-auto max-w-xl space-y-6">
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
          job_title: staffProfile?.job_title ?? "",
          office_id: user.officeId ?? "",
          weekly_capacity_hours: staffProfile?.weekly_capacity_hours ?? 40,
          billable_rate:
            user.role !== "staff"
              ? (staffProfile?.billable_rate as number | null)?.toString() ?? ""
              : "",
          cost_rate:
            user.role !== "staff"
              ? (staffProfile?.cost_rate as number | null)?.toString() ?? ""
              : "",
        }}
        role={user.role}
        offices={offices ?? []}
      />
    </div>
  );
}
