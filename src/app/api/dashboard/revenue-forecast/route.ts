import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { getForecastForTenant } from "@/lib/forecast/engine";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const admin = createAdminClient();

    const [forecastRows, { data: staffProfiles }, { data: tenant }] =
      await Promise.all([
        getForecastForTenant(user.tenantId, weeks),
        admin
          .from("staff_profiles")
          .select("billable_rate")
          .eq("tenant_id", user.tenantId)
          .not("billable_rate", "is", null),
        admin
          .from("tenants")
          .select("default_currency")
          .eq("id", user.tenantId)
          .single(),
      ]);

    const currency = tenant?.default_currency ?? "USD";

    const ratedProfiles = staffProfiles ?? [];
    const avgHourlyRate =
      ratedProfiles.length > 0
        ? ratedProfiles.reduce((sum, s) => sum + (s.billable_rate ?? 0), 0) /
          ratedProfiles.length
        : 0;

    const roundedRate = Math.round(avgHourlyRate * 100) / 100;

    const responseWeeks = forecastRows
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .map((row) => ({
        week_start: row.week_start,
        billable_hours: row.total_project_hours,
        estimated_revenue: Math.round(row.total_project_hours * roundedRate * 100) / 100,
      }));

    return NextResponse.json({
      average_hourly_rate: roundedRate,
      currency,
      weeks: responseWeeks,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revenue forecast calculation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
