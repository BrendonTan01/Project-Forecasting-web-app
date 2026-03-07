import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import OfficeForm from "./OfficeForm";
import DeleteOfficeButton from "./DeleteOfficeButton";

export default async function AdminOfficesPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();

  const { data: offices } = await supabase
    .from("offices")
    .select("id, name, country, timezone, weekly_working_hours")
    .eq("tenant_id", user.tenantId)
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      {/* Existing offices */}
      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">
          Offices ({offices?.length ?? 0})
        </h2>
        {offices && offices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Country</th>
                  <th className="pb-2">Timezone</th>
                  <th className="pb-2 text-right">Hrs / week</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {offices.map((office) => (
                  <tr key={office.id} className="border-b border-zinc-100">
                    <td className="py-2 font-medium text-zinc-900">{office.name}</td>
                    <td className="py-2 text-sm text-zinc-700">{office.country}</td>
                    <td className="py-2 font-mono text-sm text-zinc-700">{office.timezone}</td>
                    <td className="py-2 text-right text-sm text-zinc-800">
                      {office.weekly_working_hours}h
                    </td>
                    <td className="py-2 text-right">
                      <DeleteOfficeButton officeId={office.id} officeName={office.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No offices configured yet.</p>
        )}
      </div>

      {/* Add office */}
      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Add office</h2>
        <OfficeForm mode="create" />
      </div>
    </div>
  );
}
