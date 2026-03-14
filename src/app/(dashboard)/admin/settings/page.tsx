import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import OrgSettingsForm from "./OrgSettingsForm";

export default async function AdminSettingsPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, industry, default_currency, planning_hours_per_person_per_week")
    .eq("id", user.tenantId)
    .single();

  if (!tenant) return <p className="text-sm text-zinc-600">Organisation not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-zinc-900">Organisation settings</h2>
        <p className="text-sm text-zinc-600">
          Update your organisation&apos;s name, industry, default currency, and planning assumptions.
        </p>
      </div>
      <div className="app-card p-4 max-w-xl">
        <OrgSettingsForm
          defaultValues={{
            name: tenant.name,
            industry: tenant.industry,
            default_currency: tenant.default_currency,
            planning_hours_per_person_per_week:
              Number(tenant.planning_hours_per_person_per_week ?? 40),
          }}
        />
      </div>
    </div>
  );
}
