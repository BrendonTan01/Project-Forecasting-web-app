import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import {
  calculateUtilisation,
  formatUtilisation,
  getUtilisationStatus,
} from "@/lib/utils/utilisation";
import {
  getProjectHealthStatus,
  getProjectHealthLabel,
  getProjectHealthColour,
} from "@/lib/utils/projectHealth";

// Period: last 30 days for utilisation
function getPeriodDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

export default async function DashboardPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();
  const { start, end } = getPeriodDates();

  // Staff and their capacity
  const { data: staffProfiles } = await supabase
    .from("staff_profiles")
    .select("id, user_id, weekly_capacity_hours, users(email)")
    .eq("tenant_id", user.tenantId);

  const staffIds = staffProfiles?.map((s) => s.id) ?? [];

  // Time entries for period
  const { data: timeEntries } = await supabase
    .from("time_entries")
    .select("staff_id, hours, billable_flag")
    .eq("tenant_id", user.tenantId)
    .gte("date", start)
    .lte("date", end);

  // Project assignments (allocation %)
  const { data: assignments } = await supabase
    .from("project_assignments")
    .select("staff_id, allocation_percentage")
    .in("staff_id", staffIds);

  // Leave hours for period
  const { data: leaveRequests } = await supabase
    .from("leave_requests")
    .select("staff_id, start_date, end_date")
    .eq("tenant_id", user.tenantId)
    .eq("status", "approved")
    .or(`start_date.lte.${end},end_date.gte.${start}`);

  // Projects at risk
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, estimated_hours")
    .eq("tenant_id", user.tenantId)
    .eq("status", "active");

  const projectIds = projects?.map((p) => p.id) ?? [];
  const { data: projectHours } = projectIds.length
    ? await supabase
        .from("time_entries")
        .select("project_id, hours")
        .in("project_id", projectIds)
    : { data: [] };

  const actualByProject = (projectHours ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.hours);
      return acc;
    },
    {}
  );

  const projectsAtRisk = projects?.filter((p) => {
    const actual = actualByProject[p.id] ?? 0;
    const health = getProjectHealthStatus(actual, p.estimated_hours);
    return health === "at_risk" || health === "overrun";
  }) ?? [];

  // Calculate metrics per staff
  const staffMetrics = staffProfiles?.map((sp) => {
    const hoursLogged = timeEntries?.filter((e) => e.staff_id === sp.id).reduce((s, e) => s + Number(e.hours), 0) ?? 0;
    const billableHours = timeEntries?.filter((e) => e.staff_id === sp.id && e.billable_flag).reduce((s, e) => s + Number(e.hours), 0) ?? 0;
    const allocationSum = assignments?.filter((a) => a.staff_id === sp.id).reduce((s, a) => s + Number(a.allocation_percentage), 0) ?? 0;

    // Capacity for 30 days: weekly_capacity * 4.3 weeks
    const capacityHours = sp.weekly_capacity_hours * (30 / 7);
    const utilisation = calculateUtilisation(billableHours, capacityHours);
    const status = getUtilisationStatus(utilisation);

    return {
      id: sp.id,
      capacityHours,
      billableHours,
      totalHours: hoursLogged,
      allocationSum,
      utilisation,
      status,
    };
  }) ?? [];

  const underutilised = staffMetrics.filter((s) => s.status === "underutilised").length;
  const overallocated = staffMetrics.filter((s) => s.status === "overallocated").length;

  const totalCapacity = staffMetrics.reduce((s, m) => s + m.capacityHours, 0);
  const totalBillable = staffMetrics.reduce((s, m) => s + m.billableHours, 0);
  const totalHours = staffMetrics.reduce((s, m) => s + m.totalHours, 0);
  const overallUtilisation = calculateUtilisation(totalBillable, totalCapacity);
  const billableRatio = totalHours > 0 ? totalBillable / totalHours : 0;

  // Capacity next 30/60/90 days (simplified: free = capacity - allocated - leave)
  const freeCapacity30 = staffMetrics.reduce((s, m) => {
    const allocated = (m.allocationSum / 100) * m.capacityHours;
    return s + Math.max(0, m.capacityHours - allocated);
  }, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Executive Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Utilisation rate</p>
          <p className="text-2xl font-semibold text-zinc-900">
            {formatUtilisation(overallUtilisation)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Billable ratio</p>
          <p className="text-2xl font-semibold text-zinc-900">
            {totalHours > 0 ? `${(billableRatio * 100).toFixed(1)}%` : "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Staff overallocated</p>
          <p className={`text-2xl font-semibold ${overallocated > 0 ? "text-amber-700" : "text-zinc-900"}`}>
            {overallocated}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Staff underutilised</p>
          <p className={`text-2xl font-semibold ${underutilised > 0 ? "text-amber-700" : "text-zinc-900"}`}>
            {underutilised}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Free capacity (30d)</p>
          <p className="text-2xl font-semibold text-zinc-900">
            {freeCapacity30.toFixed(0)}h
          </p>
        </div>
      </div>

      {/* Capacity heatmap */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Capacity heatmap</h2>
        <p className="mb-4 text-sm text-zinc-700">
          Staff utilisation (last 30 days). Green: healthy, Amber: under/over
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Staff</th>
                <th className="pb-2 text-right">Utilisation</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {staffMetrics.map((m, i) => {
                const staff = staffProfiles?.[i] as { id: string; users?: { email: string } | null } | undefined;
                const email = staff?.users?.email ?? "Unknown";
                const statusColour =
                  m.status === "overallocated"
                    ? "text-amber-700 font-medium"
                    : m.status === "underutilised"
                      ? "text-amber-700 font-medium"
                      : "text-emerald-700 font-medium";
                return (
                  <tr key={m.id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <Link
                        href={`/staff/${m.id}`}
                        className="text-zinc-900 hover:underline"
                      >
                        {email}
                      </Link>
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {formatUtilisation(m.utilisation)}
                    </td>
                    <td className={`py-2 text-right ${statusColour}`}>
                      {m.status === "healthy" ? "OK" : m.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerts */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Alerts</h2>
        <div className="space-y-2">
          {overallocated > 0 && (
            <Link
              href="/alerts"
              className="block rounded bg-amber-50 p-2 text-sm text-amber-800 hover:bg-amber-100"
            >
              {overallocated} staff overallocated (&gt;110%)
            </Link>
          )}
          {underutilised > 0 && (
            <Link
              href="/alerts"
              className="block rounded bg-amber-50 p-2 text-sm text-amber-800 hover:bg-amber-100"
            >
              {underutilised} staff underutilised (&lt;60%)
            </Link>
          )}
          {projectsAtRisk.map((p) => {
            const actual = actualByProject[p.id] ?? 0;
            const health = getProjectHealthStatus(actual, p.estimated_hours);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={`block rounded p-2 text-sm ${health === "overrun" ? "bg-red-50 text-red-800 hover:bg-red-100" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
              >
                Project &quot;{p.name}&quot; {getProjectHealthLabel(health)}
              </Link>
            );
          })}
          {overallocated === 0 && underutilised === 0 && projectsAtRisk.length === 0 && (
            <p className="text-sm text-zinc-600">No alerts</p>
          )}
        </div>
      </div>
    </div>
  );
}
