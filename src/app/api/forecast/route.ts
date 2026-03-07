import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { runForecastForTenant } from "@/lib/forecast/engine";

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;

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
    const forecastRows = await runForecastForTenant(user.tenantId, weeks);

    const responseWeeks = forecastRows
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .map((row) => ({
        week_start: row.week_start,
        total_capacity: row.total_capacity,
        total_project_hours: row.total_project_hours,
        utilization_rate: row.utilization_rate,
        staffing_gap: row.staffing_gap,
      }));

    return NextResponse.json({ weeks: responseWeeks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forecast calculation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
