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
    <div className="space-y-10">
      <section className="app-panel">
        <div className="app-panel-body">
          <p className="app-section-caption">Delivery intelligence</p>
          <h1 className="mt-1 text-[2.25rem] font-semibold tracking-tight text-zinc-900">Forecast</h1>
          <p className="mt-2 text-sm text-[color:var(--muted-text)]">
          12-week rolling forecast of team capacity, project load, and staffing gaps.
        </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-metric-card">
          <p className="app-metric-label">Avg. utilization</p>
          <p className="app-metric-value mt-2">84.2%</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Total capacity</p>
          <p className="app-metric-value mt-2">14,400h</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Active gaps</p>
          <p className="app-metric-value mt-2 text-[color:var(--danger)]">12</p>
        </div>
        <div className="app-metric-card">
          <p className="app-metric-label">Forecast accuracy</p>
          <p className="app-metric-value mt-2">96.8%</p>
        </div>
      </section>

      <section className="app-panel">
        <div className="app-panel-header">
          <div>
            <h2 className="text-base font-semibold text-zinc-800">Weekly Utilization Forecast</h2>
            <p className="mt-1 text-xs text-[color:var(--muted-text)]">
          Projected capacity vs. project hours and resulting utilization rate per week.
        </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="app-btn app-btn-secondary px-3 py-1.5 text-xs">Export CSV</button>
            <button type="button" className="app-btn app-btn-primary px-3 py-1.5 text-xs">View Details</button>
          </div>
        </div>
        <div className="app-panel-body">
        <ForecastTable weeks={12} />
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
        <StaffingGapsTable weeks={12} />
        </div>
      </section>
    </div>
  );
}
