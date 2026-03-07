import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { calculateUtilisation, formatUtilisation } from "@/lib/utils/utilisation";
import { getRelationOne } from "@/lib/utils/supabase-relations";
import {
  filterEffectiveAssignmentsForWeek,
  getCurrentWeekMondayString,
} from "@/lib/utils/assignmentEffective";

function getPeriodDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

export default async function StaffPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();
  const { start, end } = getPeriodDates();

  const { data: staffProfiles } = await supabase
    .from("staff_profiles")
    .select(`
      id,
      user_id,
      job_title,
      weekly_capacity_hours,
      users (email, role, office_id, offices (name, country))
    `)
    .eq("tenant_id", user.tenantId);

  const staffIds = staffProfiles?.map((s) => s.id) ?? [];

  const [{ data: timeEntries }, { data: assignments }] = await Promise.all([
    staffIds.length
      ? supabase
          .from("time_entries")
          .select("staff_id, hours, billable_flag")
          .eq("tenant_id", user.tenantId)
          .in("staff_id", staffIds)
          .gte("date", start)
          .lte("date", end)
      : Promise.resolve({ data: [] as { staff_id: string; hours: number; billable_flag: boolean }[] }),
    staffIds.length
      ? supabase
          .from("project_assignments")
          .select("staff_id, project_id, week_start, weekly_hours_allocated, projects(start_date, end_date, status)")
          .eq("tenant_id", user.tenantId)
          .in("staff_id", staffIds)
      : Promise.resolve({ data: [] as { staff_id: string; project_id: string; week_start: string | null; weekly_hours_allocated: number; projects: { start_date: string | null; end_date: string | null; status: string } | { start_date: string | null; end_date: string | null; status: string }[] | null }[] }),
  ]);

  const currentWeekStart = getCurrentWeekMondayString();
  const effectiveAssignments = filterEffectiveAssignmentsForWeek(
    (assignments ?? []).map((a) => ({
      ...a,
      week_start: a.week_start ?? null,
      weekly_hours_allocated: Number(a.weekly_hours_allocated ?? 0),
    })),
    currentWeekStart
  );

  const weeklyHoursByStaff = effectiveAssignments.reduce<Record<string, number>>(
    (acc, a) => {
      acc[a.staff_id] = (acc[a.staff_id] ?? 0) + Number(a.weekly_hours_allocated);
      return acc;
    },
    {}
  );

  const billableByStaff = (timeEntries ?? []).reduce<Record<string, number>>(
    (acc, e) => {
      if (e.billable_flag) {
        acc[e.staff_id] = (acc[e.staff_id] ?? 0) + Number(e.hours);
      }
      return acc;
    },
    {}
  );

  return (
    <div>
      <h1 className="app-page-title mb-6">Staff Directory</h1>

      <div className="app-card overflow-hidden">
        <table className="app-table min-w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Staff
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Office
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Role
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                Allocation
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                Utilisation
              </th>
            </tr>
          </thead>
          <tbody>
            {staffProfiles?.map((sp) => {
              const u = getRelationOne((sp as { users?: unknown }).users) as { email: string; role: string; offices?: { name: string; country: string } | { name: string; country: string }[] | null } | null;
              const office = u?.offices ? getRelationOne(u.offices) as { name: string; country: string } | null : null;
              const capacity = sp.weekly_capacity_hours * (30 / 7);
              const billable = billableByStaff[sp.id] ?? 0;
              const utilisation = calculateUtilisation(billable, capacity);
              const weeklyHours = weeklyHoursByStaff[sp.id] ?? 0;
              const allocationPercent =
                sp.weekly_capacity_hours > 0
                  ? (weeklyHours / Number(sp.weekly_capacity_hours)) * 100
                  : 0;

              return (
                <tr key={sp.id} className="border-b border-zinc-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/staff/${sp.id}`}
                      className="app-link font-medium text-zinc-900"
                    >
                      {u?.email ?? "Unknown"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {office ? `${office.name} (${office.country})` : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {u?.role ?? sp.job_title ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-zinc-800">
                    {allocationPercent.toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-zinc-800">
                    {formatUtilisation(utilisation)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(!staffProfiles || staffProfiles.length === 0) && (
        <p className="app-empty-state p-8 text-center">
          No staff found.
        </p>
      )}
    </div>
  );
}
