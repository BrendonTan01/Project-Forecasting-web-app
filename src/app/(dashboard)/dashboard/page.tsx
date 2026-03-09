import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import StaffDashboard from "./StaffDashboard";
import { getDashboardWindowData } from "@/lib/dashboard/data";
import DashboardOverviewClient from "@/components/dashboard/DashboardOverviewClient";

// Period: last 30 days for utilisation
function getPeriodDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

export default async function DashboardPage({
  searchParams: _searchParams,
}: {
  searchParams: Promise<{ health?: string; sort?: string }>;
}) {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role === "staff") {
    return <StaffDashboard />;
  }
  const { start, end } = getPeriodDates();
  await getDashboardWindowData(user.tenantId, start, end, user.id);

  return (
    <div className="space-y-6">
      <h1 className="app-page-title">Executive Dashboard</h1>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-zinc-900">At-a-glance overview</h2>
          <p className="text-sm text-zinc-600">
            Visual summary for executives with key forecast, utilization, and capacity signals.
          </p>
        </div>
        <DashboardOverviewClient weeks={26} />
      </section>

    </div>
  );
}
