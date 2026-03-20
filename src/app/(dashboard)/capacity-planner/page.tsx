import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { headers } from "next/headers";
import CapacityPlannerTabs from "./CapacityPlannerTabs";
import type { CapacityPlannerResponse } from "@/app/api/capacity-planner/route";

export default async function CapacityPlannerPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const canEdit = user.role === "manager" || user.role === "administrator";

  // Fetch staff planner data server-side for the Staff assignments tab
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

  let staffData: CapacityPlannerResponse | null = null;
  let staffFetchError: string | null = null;

  try {
    const cookieHeader = headersList.get("cookie") ?? "";
    const res = await fetch(`${protocol}://${host}/api/capacity-planner`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    if (res.ok) {
      staffData = (await res.json()) as CapacityPlannerResponse;
    } else {
      const body = await res.json().catch(() => ({}));
      staffFetchError =
        (body as { error?: string }).error ?? "Failed to load capacity data";
    }
  } catch (err) {
    staffFetchError = err instanceof Error ? err.message : "Network error";
  }

  return (
    <div className="space-y-6">
      <section className="app-panel">
        <div className="app-panel-body">
          <p className="app-section-caption">Planning intelligence</p>
          <h1 className="mt-1 text-[2rem] font-semibold tracking-tight text-zinc-900">Capacity Planner</h1>
          <p className="app-page-subtitle mt-2">
            Identify overload by office and week, or manage staff assignments.
          </p>
        </div>
      </section>
      <CapacityPlannerTabs
        staffInitialData={staffData}
        staffFetchError={staffFetchError}
        canEdit={canEdit}
      />
    </div>
  );
}
