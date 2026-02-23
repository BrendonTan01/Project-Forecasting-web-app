import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";

function getPeriodDays(days: number) {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export default async function CapacityPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();

  const periods = [
    { label: "30 days", days: 30 },
    { label: "60 days", days: 60 },
    { label: "90 days", days: 90 },
  ];

  const { data: staffProfiles } = await supabase
    .from("staff_profiles")
    .select("id, weekly_capacity_hours, users(email)")
    .eq("tenant_id", user.tenantId);

  const staffIds = staffProfiles?.map((s) => s.id) ?? [];

  const { data: assignments } = await supabase
    .from("project_assignments")
    .select("staff_id, allocation_percentage, projects(name)")
    .in("staff_id", staffIds);

  const { data: leaveRequests } = await supabase
    .from("leave_requests")
    .select("staff_id, start_date, end_date")
    .eq("tenant_id", user.tenantId)
    .eq("status", "approved");

  // Calculate free capacity per staff for each period
  const capacityData = staffProfiles?.map((sp) => {
    const allocationSum = assignments?.filter((a) => a.staff_id === sp.id).reduce((s, a) => s + Number(a.allocation_percentage), 0) ?? 0;

    // Leave hours in next 90 days
    const leaveHours90 = leaveRequests?.filter((lr) => {
      if (lr.staff_id !== sp.id) return false;
      const start = new Date(lr.start_date);
      const end = new Date(lr.end_date);
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 90);
      return end >= new Date() && start <= periodEnd;
    }).reduce((sum, lr) => {
      const start = new Date(Math.max(new Date(lr.start_date).getTime(), Date.now()));
      const end = new Date(lr.end_date);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return sum + days * (sp.weekly_capacity_hours / 5); // Approx 5 working days/week
    }, 0) ?? 0;

    const capacity30 = sp.weekly_capacity_hours * (30 / 7);
    const capacity60 = sp.weekly_capacity_hours * (60 / 7);
    const capacity90 = sp.weekly_capacity_hours * (90 / 7);

    const allocated30 = (allocationSum / 100) * capacity30;
    const allocated60 = (allocationSum / 100) * capacity60;
    const allocated90 = (allocationSum / 100) * capacity90;

    const leave30 = leaveHours90 * (30 / 90);
    const leave60 = leaveHours90 * (60 / 90);

    return {
      id: sp.id,
      email: (() => {
        const u = (sp as { users?: { email: string } | { email: string }[] | null }).users;
        return (Array.isArray(u) ? u[0]?.email : u?.email) ?? "Unknown";
      })(),
      weeklyCapacity: sp.weekly_capacity_hours,
      allocationSum,
      free30: Math.max(0, capacity30 - allocated30 - leave30),
      free60: Math.max(0, capacity60 - allocated60 - leave60),
      free90: Math.max(0, capacity90 - allocated90 - leaveHours90),
      overload30: allocationSum > 100,
      overload60: allocationSum > 100,
      overload90: allocationSum > 100,
    };
  }) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Capacity Planner</h1>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-medium text-zinc-900">
          Allocation overview
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700">
                  Staff
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700">
                  Weekly capacity
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700">
                  Allocation
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700">
                  Free (30d)
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700">
                  Free (60d)
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700">
                  Free (90d)
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {capacityData.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/staff/${row.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {row.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">
                    {row.weeklyCapacity}h
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">
                    {row.allocationSum}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">
                    {row.free30.toFixed(0)}h
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">
                    {row.free60.toFixed(0)}h
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">
                    {row.free90.toFixed(0)}h
                  </td>
                  <td className="px-4 py-3">
                    {(row.overload30 || row.overload60 || row.overload90) && (
                      <span className="text-sm font-medium text-amber-600">
                        Overload
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeline view - simplified */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-medium text-zinc-900">Project allocations</h2>
        {assignments && assignments.length > 0 ? (
          <div className="space-y-2">
            {assignments.map((a) => {
              const staff = staffProfiles?.find((s) => s.id === a.staff_id);
              const proj = a.projects as { name: string } | { name: string }[] | null;
              const projectName = Array.isArray(proj) ? proj[0]?.name : proj?.name;
              const staffUsers = (staff as { users?: { email: string } | { email: string }[] | null })?.users;
              const staffEmail = (Array.isArray(staffUsers) ? staffUsers[0]?.email : staffUsers?.email) ?? "Unknown";
              return (
                <div
                  key={a.staff_id + (projectName ?? "")}
                  className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2"
                >
                  <span className="text-sm text-zinc-600">
                    {staffEmail}
                  </span>
                  <span className="text-sm text-zinc-900">{projectName ?? "Unknown"}</span>
                  <span className="text-sm font-medium text-zinc-600">
                    {a.allocation_percentage}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No project assignments</p>
        )}
      </div>
    </div>
  );
}
