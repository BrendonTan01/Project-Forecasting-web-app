import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { getCapacityData } from "@/lib/dashboard/data";

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function countWorkingDaysInRange(start: Date, end: Date): number {
  if (end < start) return 0;
  let count = 0;
  const current = startOfDay(start);
  const rangeEnd = startOfDay(end);
  while (current <= rangeEnd) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

function getOverlapRange(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): { start: Date; end: Date } | null {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (end < start) return null;
  return { start, end };
}

export default async function CapacityPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const periods = [
    { key: "1m", label: "1 month", workingDays: 20 },
    { key: "2m", label: "2 months", workingDays: 40 },
    { key: "3m", label: "3 months", workingDays: 60 },
  ];

  const { staffProfiles, leaveRequests, assignments } = await getCapacityData(user.tenantId, user.id);

  // Calculate free capacity per staff for each period
  const capacityData = staffProfiles.map((sp) => {
    const allocationSum =
      assignments
        .filter((a) => a.staff_id === sp.id)
        .reduce((sum, a) => sum + Number(a.allocation_percentage), 0) ?? 0;
    const staffAssignments = assignments.filter((a) => a.staff_id === sp.id);
    const staffLeaves = leaveRequests.filter((lr) => lr.staff_id === sp.id);
    const today = startOfDay(new Date());

    const periodFreeHours = periods.reduce<Record<string, number>>((acc, period) => {
      const periodEnd = addDays(today, period.workingDays - 1);
      const totalCapacityHours = sp.weekly_capacity_hours * (period.workingDays / 5);

      const allocatedHours = staffAssignments.reduce((sum, assignment) => {
        const proj = assignment.projects as
          | { start_date: string | null; end_date: string | null }
          | { start_date: string | null; end_date: string | null }[]
          | null;
        const project = Array.isArray(proj) ? proj[0] : proj;
        const projectStart = project?.start_date ? new Date(`${project.start_date}T00:00:00Z`) : today;
        const projectEnd = project?.end_date ? new Date(`${project.end_date}T00:00:00Z`) : periodEnd;
        const overlap = getOverlapRange(today, periodEnd, projectStart, projectEnd);
        if (!overlap) return sum;
        const overlapWorkingDays = countWorkingDaysInRange(overlap.start, overlap.end);
        const assignmentHours = (Number(assignment.allocation_percentage) / 100) * sp.weekly_capacity_hours * (overlapWorkingDays / 5);
        return sum + assignmentHours;
      }, 0);

      const leaveHours = staffLeaves.reduce((sum, leave) => {
        const leaveStart = new Date(`${leave.start_date}T00:00:00Z`);
        const leaveEnd = new Date(`${leave.end_date}T00:00:00Z`);
        const overlap = getOverlapRange(today, periodEnd, leaveStart, leaveEnd);
        if (!overlap) return sum;
        const overlapWorkingDays = countWorkingDaysInRange(overlap.start, overlap.end);
        return sum + (sp.weekly_capacity_hours / 5) * overlapWorkingDays;
      }, 0);

      acc[period.key] = totalCapacityHours - allocatedHours - leaveHours;
      return acc;
    }, {});

    return {
      id: sp.id,
      email: (() => {
        const u = (sp as { users?: { email: string } | { email: string }[] | null }).users;
        return (Array.isArray(u) ? u[0]?.email : u?.email) ?? "Unknown";
      })(),
      weeklyCapacity: sp.weekly_capacity_hours,
      allocationSum,
      free1m: periodFreeHours["1m"] ?? 0,
      free2m: periodFreeHours["2m"] ?? 0,
      free3m: periodFreeHours["3m"] ?? 0,
      overload1m: (periodFreeHours["1m"] ?? 0) < 0,
      overload2m: (periodFreeHours["2m"] ?? 0) < 0,
      overload3m: (periodFreeHours["3m"] ?? 0) < 0,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="app-page-title">Capacity Planner</h1>

      <div className="app-card">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold text-zinc-900">
          Allocation overview
        </h2>
        <div className="overflow-x-auto">
          <table className="app-table min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                  Staff
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                  Weekly capacity
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                  Allocation
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                  Free (1m)
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                  Free (2m)
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                  Free (3m)
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
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
                      className="app-link font-medium text-zinc-900"
                    >
                      {row.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-800">
                    {row.weeklyCapacity}h
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-zinc-800">
                    {row.allocationSum}%
                  </td>
                  <td className={`px-4 py-3 text-right text-sm ${row.free1m < 0 ? "font-semibold text-red-700" : "text-zinc-800"}`}>
                    {row.free1m.toFixed(0)}h
                  </td>
                  <td className={`px-4 py-3 text-right text-sm ${row.free2m < 0 ? "font-semibold text-red-700" : "text-zinc-800"}`}>
                    {row.free2m.toFixed(0)}h
                  </td>
                  <td className={`px-4 py-3 text-right text-sm ${row.free3m < 0 ? "font-semibold text-red-700" : "text-zinc-800"}`}>
                    {row.free3m.toFixed(0)}h
                  </td>
                  <td className="px-4 py-3">
                    {(row.overload1m || row.overload2m || row.overload3m) && (
                      <span className="text-sm font-semibold text-amber-700">
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
      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Project allocations</h2>
        {assignments.length > 0 ? (
          <div className="space-y-2">
            {assignments.map((a) => {
              const staff = staffProfiles.find((s) => s.id === a.staff_id);
              const proj = a.projects as
                | { name: string; start_date: string | null; end_date: string | null }
                | { name: string; start_date: string | null; end_date: string | null }[]
                | null;
              const projectName = Array.isArray(proj) ? proj[0]?.name : proj?.name;
              const staffUsers = (staff as { users?: { email: string } | { email: string }[] | null })?.users;
              const staffEmail = (Array.isArray(staffUsers) ? staffUsers[0]?.email : staffUsers?.email) ?? "Unknown";
              return (
                <div
                  key={a.staff_id + (projectName ?? "")}
                  className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 hover:bg-zinc-50"
                >
                  <span className="text-sm text-zinc-700">
                    {staffEmail}
                  </span>
                  <span className="text-sm font-medium text-zinc-900">{projectName ?? "Unknown"}</span>
                  <span className="text-sm font-semibold text-zinc-800">
                    {a.allocation_percentage}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No project assignments</p>
        )}
      </div>
    </div>
  );
}
