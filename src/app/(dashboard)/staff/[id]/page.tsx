import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { calculateUtilisation, formatUtilisation } from "@/lib/utils/utilisation";

function getPeriodDates(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();

  const { data: staffProfile } = await supabase
    .from("staff_profiles")
    .select("id, user_id, job_title, weekly_capacity_hours, billable_rate, cost_rate, users (email, office_id, offices (name, country, timezone))")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!staffProfile) notFound();

  const { start, end } = getPeriodDates(30);

  const { data: timeEntries } = await supabase
    .from("time_entries")
    .select("hours, billable_flag, date, projects(name)")
    .eq("staff_id", id)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false });

  const { data: assignments } = await supabase
    .from("project_assignments")
    .select("allocation_percentage, projects(id, name)")
    .eq("staff_id", id);

  const { data: leaveRequests } = await supabase
    .from("leave_requests")
    .select("start_date, end_date, leave_type, status")
    .eq("staff_id", id)
    .gte("end_date", new Date().toISOString().split("T")[0])
    .order("start_date")
    .limit(5);

  const usersRaw = staffProfile.users as { email: string; offices?: { name: string; country: string; timezone: string } | { name: string; country: string; timezone: string }[] | null } | { email: string; offices?: unknown }[] | null;
  const u = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw;
  const offices = u?.offices;
  const office = Array.isArray(offices) ? offices[0] : offices;
  const capacity = staffProfile.weekly_capacity_hours * (30 / 7);
  const billable = timeEntries?.filter((e) => e.billable_flag).reduce((s, e) => s + Number(e.hours), 0) ?? 0;
  const utilisation = calculateUtilisation(billable, capacity);
  const allocationSum = assignments?.reduce((s, a) => s + Number(a.allocation_percentage), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff" className="text-sm text-zinc-600 hover:underline">
          ← Staff
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
          {u?.email ?? "Unknown"}
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Job title</p>
          <p className="font-semibold text-zinc-900">{staffProfile.job_title ?? "-"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Office</p>
          <p className="font-semibold text-zinc-900">
            {office ? `${office.name} (${office.country})` : "-"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Utilisation (30d)</p>
          <p className="font-semibold text-zinc-900">{formatUtilisation(utilisation)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Allocation</p>
          <p className="font-semibold text-zinc-900">{allocationSum}%</p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Current projects</h2>
        {assignments && assignments.length > 0 ? (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const proj = a.projects as { id: string; name: string } | { id: string; name: string }[] | null;
              const project = Array.isArray(proj) ? proj[0] : proj;
              return (
                <li key={project?.id ?? ""} className="flex justify-between">
                  <Link
                    href={`/projects/${project?.id}`}
                    className="text-zinc-900 hover:underline"
                  >
                    {project?.name ?? "Unknown"}
                  </Link>
                  <span className="font-medium text-zinc-800">{a.allocation_percentage}%</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No project assignments</p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Forecast availability</h2>
        <p className="text-sm text-zinc-700">
          Weekly capacity: <span className="font-medium text-zinc-900">{staffProfile.weekly_capacity_hours}h</span>
        </p>
        <p className="text-sm text-zinc-700">
          Allocated: <span className="font-medium text-zinc-900">{allocationSum}%</span> ({(allocationSum / 100) * staffProfile.weekly_capacity_hours}h/week)
        </p>
        <p className="mt-2 text-sm font-semibold text-zinc-900">
          Free capacity: {Math.max(0, staffProfile.weekly_capacity_hours * (1 - allocationSum / 100)).toFixed(1)}h/week
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Upcoming leave</h2>
        {leaveRequests && leaveRequests.length > 0 ? (
          <ul className="space-y-2">
            {leaveRequests.map((lr) => (
              <li key={lr.start_date + lr.end_date} className="text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">{lr.leave_type}:</span> {lr.start_date} to {lr.end_date} ({lr.status})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No upcoming leave</p>
        )}
      </div>
    </div>
  );
}
