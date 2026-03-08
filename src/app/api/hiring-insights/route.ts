import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { runHiringPredictionsForTenant } from "@/lib/forecast/engine";

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
    const predictions = await runHiringPredictionsForTenant(user.tenantId, weeks);
    const actionable = predictions
      .filter((prediction) => prediction.recommendation_type !== "none")
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .map((prediction) => ({
        week_start: prediction.week_start,
        utilization_rate: prediction.utilization_rate,
        recommended_hires: prediction.recommended_hires,
        message: prediction.message,
      }));

    return NextResponse.json(actionable);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load hiring insights";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
