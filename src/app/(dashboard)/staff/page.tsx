import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { calculateUtilisation, formatUtilisation } from "@/lib/utils/utilisation";
import { getRelationOne } from "@/lib/utils/supabase-relations";
import { getStaffDisplayName } from "@/lib/utils/staffDisplay";
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
      name,
      user_id,
      job_title,
      weekly_capacity_hours,
      users (name, email, role, office_id, offices (name, country))
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
    <div className="space-y-6">
      <section className="app-panel">
        <div className="app-panel-body flex flex-wrap items-start justify-between gap-3 sm:items-center">
          <div className="space-y-2">
            <p className="app-section-caption">Operations workforce</p>
            <h1 className="mt-1 text-[2rem] font-semibold tracking-tight text-zinc-900">Staff Directory</h1>
            <p className="app-page-subtitle">
              Monitor real-time resource allocation and workforce utilization across offices.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="app-btn app-btn-secondary px-3 py-1.5 text-xs">Filter</button>
            <button type="button" className="app-btn app-btn-secondary px-3 py-1.5 text-xs">Export</button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-metric-card">
          <p className="app-metric-label">Total staff</p>
          <p className="app-metric-value mt-2">{staffProfiles?.length ?? 0}</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Allocated this week</p>
          <p className="app-metric-value mt-2">
            {Object.values(weeklyHoursByStaff).reduce((sum, value) => sum + Number(value), 0).toFixed(0)}h
          </p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Billable in period</p>
          <p className="app-metric-value mt-2">
            {Object.values(billableByStaff).reduce((sum, value) => sum + Number(value), 0).toFixed(0)}h
          </p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Window</p>
          <p className="app-metric-value mt-2">30d</p>
        </div>
      </section>

      <section className="app-panel">
        <div className="app-panel-body">
          <div className="app-table-wrap">
            <table className="app-table app-table-comfortable min-w-full">
              <thead>
                <tr>
                  <th className="text-left">
                    Staff
                  </th>
                  <th className="text-left">
                    Office
                  </th>
                  <th className="text-left">
                    Role
                  </th>
                  <th className="text-right">
                    Allocation
                  </th>
                  <th className="text-right">
                    Utilisation
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffProfiles?.map((sp) => {
                  const u = getRelationOne((sp as { users?: unknown }).users) as {
                    name?: string | null;
                    email?: string | null;
                    role: string;
                    offices?: { name: string; country: string } | { name: string; country: string }[] | null;
                  } | null;
                  const office = u?.offices ? getRelationOne(u.offices) as { name: string; country: string } | null : null;
                  const displayName = getStaffDisplayName(sp.name, u);
                  const capacity = sp.weekly_capacity_hours * (30 / 7);
                  const billable = billableByStaff[sp.id] ?? 0;
                  const utilisation = calculateUtilisation(billable, capacity);
                  const weeklyHours = weeklyHoursByStaff[sp.id] ?? 0;
                  const allocationPercent =
                    sp.weekly_capacity_hours > 0
                      ? (weeklyHours / Number(sp.weekly_capacity_hours)) * 100
                      : 0;
                  const initials = displayName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase();

                  return (
                    <tr key={sp.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                            {initials || "?"}
                          </span>
                          <Link
                            href={`/staff/${sp.id}`}
                            className="app-link font-medium text-zinc-900"
                          >
                            {displayName}
                          </Link>
                        </div>
                      </td>
                      <td className="text-sm text-zinc-700">
                        {office ? `${office.name} (${office.country})` : "-"}
                      </td>
                      <td className="text-sm text-zinc-700">
                        {u?.role ?? sp.job_title ?? "-"}
                      </td>
                      <td className="text-right text-sm font-medium text-zinc-800">
                        {allocationPercent.toFixed(0)}%
                      </td>
                      <td className="text-right text-sm font-medium text-zinc-800">
                        {formatUtilisation(utilisation)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {(!staffProfiles || staffProfiles.length === 0) && (
        <p className="app-empty-state p-8 text-center">
          No staff found.
        </p>
      )}
    </div>
  );
}
