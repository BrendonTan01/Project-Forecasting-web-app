import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { redirect } from "next/navigation";
import DashboardOverviewClient from "@/components/dashboard/DashboardOverviewClient";

export default async function DashboardOverviewPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-page-title">Dashboard Overview</h1>
        <p className="app-page-subtitle">
          Consulting capacity, forecast, and staffing intelligence at a glance.
        </p>
      </div>
      <DashboardOverviewClient weeks={12} />
    </div>
  );
}
