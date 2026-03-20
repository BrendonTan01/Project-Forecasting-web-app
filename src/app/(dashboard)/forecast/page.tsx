import { redirect } from "next/navigation";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { ForecastTable } from "@/components/api-views/ForecastTable";
import { StaffingGapsTable } from "@/components/api-views/StaffingGapsTable";
import { ForecastRoleInsights } from "@/components/api-views/ForecastRoleInsights";

export default async function ForecastPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "financials:view")) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <section className="app-panel">
        <div className="app-panel-body">
          <p className="app-section-caption">Delivery intelligence</p>
          <h1 className="mt-1 text-[2rem] font-semibold tracking-tight text-zinc-900">Forecast</h1>
          <p className="mt-2 text-sm text-[color:var(--muted-text)]">
          12-week rolling forecast of team capacity, project load, and staffing gaps.
        </p>
        </div>
      </section>

      <section className="app-panel">
        <div className="app-panel-header">
          <div>
            <h2 className="text-base font-semibold text-zinc-800">Weekly Utilization Forecast</h2>
            <p className="mt-1 text-xs text-[color:var(--muted-text)]">
          Detailed project load breakdown per week.
        </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="app-btn app-btn-secondary px-3 py-1.5 text-xs">Export CSV</button>
            <button type="button" className="app-btn app-btn-primary px-3 py-1.5 text-xs">View Details</button>
          </div>
        </div>
        <div className="app-panel-body">
        <ForecastTable weeks={9} />
        </div>
      </section>

      <section className="app-panel">
        <div className="app-panel-header">
          <div>
            <h2 className="text-base font-semibold text-zinc-800">Staffing Gap Forecast</h2>
            <p className="mt-1 text-xs text-[color:var(--muted-text)]">
          Weeks where project demand exceeds available capacity, and the estimated number of
          additional staff required.
        </p>
          </div>
        </div>
        <div className="app-panel-body">
        <StaffingGapsTable weeks={10} />
        </div>
      </section>

      <ForecastRoleInsights weeks={10} />
    </div>
  );
}
