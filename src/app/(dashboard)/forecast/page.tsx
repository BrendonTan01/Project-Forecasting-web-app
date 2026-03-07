import { redirect } from "next/navigation";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { ForecastTable } from "@/components/api-views/ForecastTable";
import { StaffingGapsTable } from "@/components/api-views/StaffingGapsTable";

export default async function ForecastPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "financials:view")) redirect("/dashboard");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Forecast</h1>
        <p className="mt-1 text-sm text-zinc-500">
          12-week rolling forecast of team capacity, project load, and staffing gaps.
        </p>
      </div>

      <section className="app-card space-y-3">
        <h2 className="text-base font-semibold text-zinc-800">Weekly Utilization Forecast</h2>
        <p className="text-xs text-zinc-500">
          Projected capacity vs. project hours and resulting utilization rate per week.
        </p>
        <ForecastTable weeks={12} />
      </section>

      <section className="app-card space-y-3">
        <h2 className="text-base font-semibold text-zinc-800">Staffing Gap Forecast</h2>
        <p className="text-xs text-zinc-500">
          Weeks where project demand exceeds available capacity, and the estimated number of
          additional staff required.
        </p>
        <StaffingGapsTable weeks={12} />
      </section>
    </div>
  );
}
