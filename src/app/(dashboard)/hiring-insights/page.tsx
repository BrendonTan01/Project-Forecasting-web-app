import { redirect } from "next/navigation";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { HiringInsightsPanel } from "@/components/api-views/HiringInsightsPanel";

export default async function HiringInsightsPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "financials:view")) redirect("/dashboard");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Hiring Insights</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Canonical hiring recommendations from the 12-week forecast.
        </p>
      </div>

      <section className="app-card space-y-3">
        <h2 className="text-base font-semibold text-zinc-800">Hiring Recommendations</h2>
        <p className="text-xs text-zinc-500">
          Skills needing hires, staff required, lead-time window, and expected shortage start.
        </p>
        <HiringInsightsPanel weeks={12} />
      </section>
    </div>
  );
}
