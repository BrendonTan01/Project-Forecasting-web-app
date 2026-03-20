import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { getForecastForTenant } from "@/lib/forecast/engine";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;
const FALLBACK_WEEKLY_HOURS = 40;

export async function GET(request: NextRequest) {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "financials:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const weeksParam = searchParams.get("weeks");
  const weeks = weeksParam
    ? Math.min(Math.max(1, parseInt(weeksParam, 10) || DEFAULT_WEEKS), MAX_WEEKS)
    : DEFAULT_WEEKS;

  try {
    const admin = createAdminClient();

    const [forecastRows, { data: staffProfiles }] = await Promise.all([
      getForecastForTenant(user.tenantId, weeks),
      admin
        .from("staff_profiles")
        .select("weekly_capacity_hours")
        .eq("tenant_id", user.tenantId),
    ]);
    const { data: tenantSettings } = await admin
      .from("tenants")
      .select("planning_hours_per_person_per_week")
      .eq("id", user.tenantId)
      .single();

    const profiles = staffProfiles ?? [];
    const avgWeeklyCapacity =
      profiles.length > 0
        ? profiles.reduce((sum, s) => sum + (s.weekly_capacity_hours ?? 0), 0) /
          profiles.length
        : FALLBACK_WEEKLY_HOURS;

    const responseWeeks = forecastRows
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .map((row) => ({
        week_start: row.week_start,
        staffing_gap: row.staffing_gap,
        capacity_balance_hours: row.total_capacity - row.total_project_hours,
        additional_staff_needed:
          row.staffing_gap > 0
            ? Math.ceil(row.staffing_gap / avgWeeklyCapacity)
            : 0,
      }));

    return NextResponse.json({
      weeks: responseWeeks,
      planning_hours_per_person_per_week: Number(
        tenantSettings?.planning_hours_per_person_per_week ?? 40
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Staffing calculation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
