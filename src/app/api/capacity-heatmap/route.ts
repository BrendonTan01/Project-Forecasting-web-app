import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 26;

function getCurrentWeekMonday(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const day = today.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  today.setUTCDate(today.getUTCDate() + diff);
  return today;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type HeatmapCell = {
  officeId: string;
  office: string;
  week: number;
  weekStart: string;
  utilization: number;
};

export type CapacityHeatmapResponse = {
  cells: HeatmapCell[];
  weekStarts: string[];
  offices: Array<{ id: string; name: string }>;
};

type RawProject = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
};

type RawAssignment = {
  id: string;
  staff_id: string;
  weekly_hours_allocated: number | string | null;
  week_start: string | null;
  projects: RawProject | RawProject[] | null;
};

function normalizeProject(p: RawProject | RawProject[] | null): RawProject | null {
  return Array.isArray(p) ? (p[0] ?? null) : p ?? null;
}

function projectOverlapsWeek(
  projectStart: string | null,
  projectEnd: string | null,
  weekStart: string,
  weekEnd: string
): boolean {
  const startsBeforeWeekEnds = projectStart === null || projectStart <= weekEnd;
  const endsAfterWeekStarts = projectEnd === null || projectEnd >= weekStart;
  return startsBeforeWeekEnds && endsAfterWeekStarts;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "financials:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const weeksParam = searchParams.get("weeks");
  const numWeeks = weeksParam
    ? Math.min(Math.max(1, parseInt(weeksParam, 10) || DEFAULT_WEEKS), MAX_WEEKS)
    : DEFAULT_WEEKS;

  const admin = createAdminClient();
  const weekMonday = getCurrentWeekMonday();

  const weekStarts: string[] = [];
  for (let i = 0; i < numWeeks; i++) {
    weekStarts.push(toDateString(addDays(weekMonday, i * 7)));
  }

  const forecastEnd = toDateString(addDays(weekMonday, numWeeks * 7 - 1));

  const [
    { data: officeRows, error: officeErr },
    { data: userRows, error: userErr },
    { data: staffRows, error: staffErr },
    { data: assignmentRows, error: assignErr },
    { data: availRows, error: availErr },
  ] = await Promise.all([
    admin
      .from("offices")
      .select("id, name")
      .eq("tenant_id", user.tenantId)
      .order("name"),

    admin
      .from("users")
      .select("id, office_id")
      .eq("tenant_id", user.tenantId),

    admin
      .from("staff_profiles")
      .select("id, user_id, weekly_capacity_hours")
      .eq("tenant_id", user.tenantId),

    admin
      .from("project_assignments")
      .select(
        "id, staff_id, weekly_hours_allocated, week_start, projects(id, name, start_date, end_date, status)"
      )
      .eq("tenant_id", user.tenantId),

    admin
      .from("staff_availability")
      .select("staff_id, week_start, available_hours")
      .eq("tenant_id", user.tenantId)
      .gte("week_start", weekStarts[0])
      .lte("week_start", forecastEnd),
  ]);

  if (officeErr) return NextResponse.json({ error: officeErr.message }, { status: 500 });
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 });
  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

  const availabilityTableMissing =
    availErr &&
    /staff_availability/i.test(availErr.message) &&
    /does not exist|relation/i.test(availErr.message);
  if (availErr && !availabilityTableMissing) {
    return NextResponse.json({ error: availErr.message }, { status: 500 });
  }
  const safeAvailRows = availabilityTableMissing ? [] : (availRows ?? []);

  // Build availability lookup: staff_id → week_start → available_hours
  const availMap = new Map<string, Map<string, number>>();
  for (const row of safeAvailRows) {
    if (!availMap.has(row.staff_id)) availMap.set(row.staff_id, new Map());
    availMap.get(row.staff_id)!.set(row.week_start, Number(row.available_hours));
  }

  // Build staff lookup: staff_id → { officeId, weeklyCap }
  type StaffMeta = { officeId: string | null; weeklyCap: number };
  const officeByUserId = new Map<string, string | null>(
    (userRows ?? []).map((u) => [u.id, u.office_id ?? null])
  );
  const staffMeta = new Map<string, StaffMeta>();
  for (const s of staffRows ?? []) {
    staffMeta.set(s.id, {
      officeId: officeByUserId.get(s.user_id) ?? null,
      weeklyCap: Number(s.weekly_capacity_hours),
    });
  }

  // Normalize and filter assignments to active projects only
  const allAssignments = ((assignmentRows ?? []) as RawAssignment[]).map((row) => ({
    id: row.id,
    staff_id: row.staff_id,
    weekly_hours_allocated: Number(row.weekly_hours_allocated ?? 0),
    week_start: row.week_start ?? null,
    project: normalizeProject(row.projects),
  }));

  const activeAssignments = allAssignments.filter((a) => a.project?.status === "active");

  // Track week-pinned overrides (staff+project+week) to suppress recurring rows
  const weeklyOverrideKeys = new Set<string>();
  for (const a of activeAssignments) {
    if (a.week_start !== null && a.project?.id) {
      weeklyOverrideKeys.add(`${a.staff_id}::${a.project.id}::${a.week_start}`);
    }
  }

  // Build: officeId → weekStart → { totalCapacity, totalAllocated }
  const officeWeekMap = new Map<string, Map<string, { cap: number; alloc: number }>>();
  for (const office of officeRows ?? []) {
    officeWeekMap.set(office.id, new Map());
    for (const ws of weekStarts) {
      officeWeekMap.get(office.id)!.set(ws, { cap: 0, alloc: 0 });
    }
  }

  // Accumulate capacity from staff profiles
  for (const [staffId, meta] of staffMeta) {
    if (!meta.officeId) continue;
    const officeWeeks = officeWeekMap.get(meta.officeId);
    if (!officeWeeks) continue;

    for (const ws of weekStarts) {
      const cell = officeWeeks.get(ws)!;
      const cap = availMap.get(staffId)?.get(ws) ?? meta.weeklyCap;
      cell.cap += cap;
    }
  }

  // Accumulate allocated hours from assignments
  for (const a of activeAssignments) {
    const meta = staffMeta.get(a.staff_id);
    if (!meta?.officeId) continue;
    const officeWeeks = officeWeekMap.get(meta.officeId);
    if (!officeWeeks) continue;

    for (const ws of weekStarts) {
      const weekEnd = toDateString(addDays(new Date(`${ws}T00:00:00Z`), 6));
      let includesThisWeek: boolean;

      if (a.week_start !== null) {
        includesThisWeek = a.week_start === ws;
      } else {
        const overrideKey = `${a.staff_id}::${a.project?.id ?? ""}::${ws}`;
        if (weeklyOverrideKeys.has(overrideKey)) continue;
        includesThisWeek = projectOverlapsWeek(
          a.project?.start_date ?? null,
          a.project?.end_date ?? null,
          ws,
          weekEnd
        );
      }

      if (includesThisWeek) {
        officeWeeks.get(ws)!.alloc += a.weekly_hours_allocated;
      }
    }
  }

  // Build heatmap cells
  const cells: HeatmapCell[] = [];
  for (const office of officeRows ?? []) {
    const officeWeeks = officeWeekMap.get(office.id);
    if (!officeWeeks) continue;

    weekStarts.forEach((ws, idx) => {
      const { cap, alloc } = officeWeeks.get(ws)!;
      const utilization = cap > 0 ? Math.round((alloc / cap) * 10000) / 100 : 0;
      cells.push({
        officeId: office.id,
        office: office.name,
        week: idx + 1,
        weekStart: ws,
        utilization,
      });
    });
  }

  const offices = (officeRows ?? []).map((o) => ({ id: o.id, name: o.name }));

  return NextResponse.json({ cells, weekStarts, offices } satisfies CapacityHeatmapResponse);
}
