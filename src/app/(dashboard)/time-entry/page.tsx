import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant, getCurrentStaffId } from "@/lib/supabase/auth-helpers";
import { getRelationOne } from "@/lib/utils/supabase-relations";
import { TimeEntrySheet } from "@/components/time-entry/TimeEntrySheet";

function getWeekDates(date: Date): { start: string; end: string; dates: string[] } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d);
  monday.setDate(diff);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(monday);
    d2.setDate(monday.getDate() + i);
    dates.push(d2.toISOString().split("T")[0]);
  }
  return {
    start: dates[0],
    end: dates[6],
    dates,
  };
}

export default async function TimeEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; staff?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUserWithTenant();
  const staffId = await getCurrentStaffId();
  if (!user || !staffId) return null;
  const canSelectStaff = user.role === "manager" || user.role === "administrator";

  const weekParam = params.week;
  const baseDate = weekParam ? new Date(weekParam) : new Date();
  const { start, end, dates } = getWeekDates(baseDate);

  const supabase = await createClient();
  let selectedStaffId = staffId;

  type StaffOption = { id: string; email: string };
  let staffOptions: StaffOption[] = [];

  if (canSelectStaff) {
    const { data: staffRows } = await supabase
      .from("staff_profiles")
      .select("id, users(email)")
      .eq("tenant_id", user.tenantId);

    staffOptions = (staffRows ?? [])
      .map((row) => {
        const relatedUser = getRelationOne((row as { users?: unknown }).users) as { email?: string } | null;
        return {
          id: row.id,
          email: relatedUser?.email ?? "Unknown",
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    if (params.staff && staffOptions.some((option) => option.id === params.staff)) {
      selectedStaffId = params.staff;
    }
  }

  // Fetch time entries for selected staff profile for this week
  const { data: rawTimeEntries } = await supabase
    .from("time_entries")
    .select(`
      id,
      project_id,
      date,
      hours,
      billable_flag,
      projects (id, name)
    `)
    .eq("staff_id", selectedStaffId)
    .gte("date", start)
    .lte("date", end)
    .order("date");

  // Normalise projects relation (Supabase may return object or array)
  const timeEntries = rawTimeEntries?.map((e) => ({
    ...e,
    projects: getRelationOne((e as { projects?: unknown }).projects) as { id: string; name: string } | null,
  }));

  // Fetch projects user can log to (assigned or all for managers)
  let projectsQuery = supabase
    .from("projects")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .eq("status", "active");

  if (user.role === "staff") {
    const { data: assignments } = await supabase
      .from("project_assignments")
      .select("project_id")
      .eq("staff_id", staffId);
    const projectIds = assignments?.map((a) => a.project_id) ?? [];
    if (projectIds.length > 0) {
      projectsQuery = projectsQuery.in("id", projectIds);
    } else {
      projectsQuery = projectsQuery.eq("id", "00000000-0000-0000-0000-000000000000"); // No projects
    }
  }

  const { data: projects } = await projectsQuery.order("name");

  return (
    <div>
      <h1 className="app-page-title mb-6">Time Entry</h1>
      <TimeEntrySheet
        dates={dates}
        timeEntries={timeEntries ?? []}
        projects={projects ?? []}
        weekStart={start}
        ownStaffId={staffId}
        selectedStaffId={selectedStaffId}
        canSelectStaff={canSelectStaff}
        staffOptions={staffOptions}
      />
    </div>
  );
}
