import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { redirect } from "next/navigation";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export default async function SettingsPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const { data: staffProfile } = await supabase
    .from("staff_profiles")
    .select("id, job_title, weekly_capacity_hours, billable_rate, cost_rate")
    .eq("user_id", user.id)
    .single();

  const { data: offices } = await supabase
    .from("offices")
    .select("id, name, country")
    .eq("tenant_id", user.tenantId)
    .order("name");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Profile settings</h1>
      <p className="text-sm text-zinc-700">
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
