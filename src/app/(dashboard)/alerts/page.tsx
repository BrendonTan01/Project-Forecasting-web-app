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

interface Alert {
  type: string;
  severity: "warning" | "error";
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
}

function getPeriodDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

function getStaffEmail(sp: { users?: { email: string } | { email: string }[] | null }): string {
  const users = sp.users;
  return (Array.isArray(users) ? users[0]?.email : users?.email) ?? "Unknown";
}

export default async function AlertsPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();
  const { start, end } = getPeriodDates();

  const alerts: Alert[] = [];

  // Staff and metrics
  const { data: staffProfiles } = await supabase
    .from("staff_profiles")
    .select("id, weekly_capacity_hours, users(email)")
    .eq("tenant_id", user.tenantId);

  const staffIds = staffProfiles?.map((s) => s.id) ?? [];

  const { data: timeEntries } = await supabase
    .from("time_entries")
    .select("staff_id, date, hours, project_id, billable_flag")
    .eq("tenant_id", user.tenantId)
    .gte("date", start)
    .lte("date", end);

  const { data: assignments } = await supabase
    .from("project_assignments")
    .select("staff_id, allocation_percentage")
    .in("staff_id", staffIds);

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

  // Utilisation alerts: underutilised (<60%), overallocated (>110%)
  staffProfiles?.forEach((sp) => {
    const capacity = sp.weekly_capacity_hours * (30 / 7);
    const billable = timeEntries?.filter((e) => e.staff_id === sp.id && e.billable_flag).reduce((s, e) => s + Number(e.hours), 0) ?? 0;
    const utilisation = calculateUtilisation(billable, capacity);
    const status = getUtilisationStatus(utilisation);
    const allocationSum = assignments?.filter((a) => a.staff_id === sp.id).reduce((s, a) => s + Number(a.allocation_percentage), 0) ?? 0;
    const email = getStaffEmail(sp);

    if (status === "underutilised") {
      alerts.push({
        type: "utilisation",
        severity: "warning",
        title: "Underutilised staff",
        description: `${email}: ${formatUtilisation(utilisation)} utilisation`,
        link: `/staff/${sp.id}`,
        linkLabel: "View profile",
      });
    }
    if (allocationSum > 110) {
      alerts.push({
        type: "utilisation",
        severity: "warning",
        title: "Overallocated staff",
        description: `${email}: ${allocationSum}% allocation`,
        link: `/staff/${sp.id}`,
        linkLabel: "View profile",
      });
    }
  });

  // Data quality: missing timesheets (no entry in last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentStart = sevenDaysAgo.toISOString().split("T")[0];

  staffProfiles?.forEach((sp) => {
    const hasRecentEntry = timeEntries?.some(
      (e) => e.staff_id === sp.id && e.date >= recentStart
    );
    if (!hasRecentEntry) {
      const email = getStaffEmail(sp);
      alerts.push({
        type: "data_quality",
        severity: "warning",
        title: "Missing timesheet",
        description: `${email}: No time entries in last 7 days`,
        link: "/time-entry",
        linkLabel: "Log time",
      });
    }
  });

  // Unrealistic daily hours (>12h)
  const dailyTotals = (timeEntries ?? []).reduce<Record<string, number>>((acc, e) => {
    const key = `${e.staff_id}-${e.date}`;
    acc[key] = (acc[key] ?? 0) + Number(e.hours);
    return acc;
  }, {});

  Object.entries(dailyTotals).forEach(([key, hours]) => {
    if (hours > 12) {
      const [staffId, date] = key.split("-");
      const staff = staffProfiles?.find((s) => s.id === staffId);
      const email = staff ? getStaffEmail(staff) : "Unknown";
      alerts.push({
        type: "data_quality",
        severity: "warning",
        title: "Unrealistic daily hours",
        description: `${email}: ${hours}h on ${date}`,
        link: "/time-entry",
        linkLabel: "Review",
      });
    }
  });

  // All time to one project (suspicious)
  const projectCountByStaff = (timeEntries ?? []).reduce<Record<string, Set<string>>>(
    (acc, e) => {
      if (!acc[e.staff_id]) acc[e.staff_id] = new Set();
      acc[e.staff_id].add(e.project_id);
      return acc;
    },
    {}
  );

  Object.entries(projectCountByStaff).forEach(([staffId, projectSet]) => {
    if (projectSet.size === 1 && (timeEntries?.filter((e) => e.staff_id === staffId).length ?? 0) > 5) {
      const staff = staffProfiles?.find((s) => s.id === staffId);
      const email = staff ? getStaffEmail(staff) : "Unknown";
      alerts.push({
        type: "data_quality",
        severity: "warning",
        title: "All time to one project",
        description: `${email}: All entries logged to single project`,
        link: `/staff/${staffId}`,
        linkLabel: "View profile",
      });
    }
  });

  // Projects at risk / overrun
  projects?.forEach((p) => {
    const actual = actualByProject[p.id] ?? 0;
    const health = getProjectHealthStatus(actual, p.estimated_hours);
    if (health === "at_risk" || health === "overrun") {
      alerts.push({
        type: "project",
        severity: health === "overrun" ? "error" : "warning",
        title: `Project ${getProjectHealthLabel(health)}`,
        description: `${p.name}: ${actual}h / ${p.estimated_hours ?? 0}h`,
        link: `/projects/${p.id}`,
        linkLabel: "View project",
      });
    }
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Alerts</h1>

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <p className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-600">
            No alerts. All systems healthy.
          </p>
        ) : (
          alerts.map((alert, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 ${
                alert.severity === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-zinc-900">{alert.title}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-700">{alert.description}</p>
                </div>
                {alert.link && (
                  <Link
                    href={alert.link}
                    className="ml-4 shrink-0 text-sm font-medium text-zinc-900 hover:underline"
                  >
                    {alert.linkLabel ?? "View"}
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
