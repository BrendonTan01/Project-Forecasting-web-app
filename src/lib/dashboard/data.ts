import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type AssignmentRow = { staff_id: string; allocation_percentage: number };
type ProjectHourRow = { project_id: string; hours: number };

export const getDashboardWindowData = unstable_cache(
  async (tenantId: string, start: string, end: string, cacheScopeKey: string) => {
    void cacheScopeKey;
    const supabase = await createClient();

    const [
      { data: staffProfiles },
      { data: projects },
      { data: proposals },
      { data: timeEntries },
    ] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("id, user_id, weekly_capacity_hours, cost_rate, users(email, office_id, offices(id, name, country))")
        .eq("tenant_id", tenantId),
      supabase
        .from("projects")
        .select("id, name, estimated_hours, start_date, end_date")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
      supabase
        .from("project_proposals")
        .select("id, name, estimated_hours, estimated_hours_per_week, status")
        .eq("tenant_id", tenantId)
        .in("status", ["draft", "submitted", "won"]),
      supabase
        .from("time_entries")
        .select("staff_id, date, hours, project_id, billable_flag")
        .eq("tenant_id", tenantId)
        .gte("date", start)
        .lte("date", end),
    ]);

    const staffIds = staffProfiles?.map((staff) => staff.id) ?? [];
    const projectIds = projects?.map((project) => project.id) ?? [];

    const [{ data: assignments }, { data: projectHours }] = await Promise.all([
      staffIds.length
        ? supabase
            .from("project_assignments")
            .select("staff_id, allocation_percentage")
            .in("staff_id", staffIds)
        : Promise.resolve({ data: [] as AssignmentRow[] }),
      projectIds.length
        ? supabase
            .from("time_entries")
            .select("project_id, hours")
            .eq("tenant_id", tenantId)
            .in("project_id", projectIds)
        : Promise.resolve({ data: [] as ProjectHourRow[] }),
    ]);

    return {
      staffProfiles: staffProfiles ?? [],
      projects: projects ?? [],
      proposals: proposals ?? [],
      timeEntries: timeEntries ?? [],
      assignments: assignments ?? [],
      projectHours: projectHours ?? [],
    };
  },
  ["dashboard-window-data-v1"],
  { revalidate: 30 }
);

type CapacityAssignmentRow = {
  staff_id: string;
  allocation_percentage: number;
  projects:
    | { name: string; start_date: string | null; end_date: string | null }
    | { name: string; start_date: string | null; end_date: string | null }[]
    | null;
};

export const getCapacityData = unstable_cache(
  async (tenantId: string, cacheScopeKey: string) => {
    void cacheScopeKey;
    const supabase = await createClient();

    const [{ data: staffProfiles }, { data: leaveRequests }] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("id, weekly_capacity_hours, users(email)")
        .eq("tenant_id", tenantId),
      supabase
        .from("leave_requests")
        .select("staff_id, start_date, end_date")
        .eq("tenant_id", tenantId)
        .eq("status", "approved"),
    ]);

    const staffIds = staffProfiles?.map((staff) => staff.id) ?? [];
    const { data: assignments } = staffIds.length
      ? await supabase
          .from("project_assignments")
          .select("staff_id, allocation_percentage, projects(name, start_date, end_date)")
          .in("staff_id", staffIds)
      : { data: [] as CapacityAssignmentRow[] };

    return {
      staffProfiles: staffProfiles ?? [],
      leaveRequests: leaveRequests ?? [],
      assignments: assignments ?? [],
    };
  },
  ["capacity-data-v1"],
  { revalidate: 30 }
);
