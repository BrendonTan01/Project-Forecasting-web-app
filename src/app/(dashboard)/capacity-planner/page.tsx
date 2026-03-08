import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { headers } from "next/headers";
import CapacityPlannerClient from "./CapacityPlannerClient";
import type { CapacityPlannerResponse } from "@/app/api/capacity-planner/route";

export default async function CapacityPlannerPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const canEdit = user.role === "manager" || user.role === "administrator";

  // Fetch planner data server-side for the initial render
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

  let data: CapacityPlannerResponse | null = null;
  let fetchError: string | null = null;

  try {
    const cookieHeader = headersList.get("cookie") ?? "";
    const res = await fetch(`${protocol}://${host}/api/capacity-planner`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    if (res.ok) {
      data = (await res.json()) as CapacityPlannerResponse;
    } else {
      const body = await res.json().catch(() => ({}));
      fetchError = (body as { error?: string }).error ?? "Failed to load capacity data";
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Network error";
  }

  if (fetchError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="app-page-title">Capacity Planner</h1>
        <p className="text-sm text-red-600">{fetchError ?? "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="app-page-title">Capacity Planner</h1>
      <CapacityPlannerClient initialData={data} canEdit={canEdit} />
    </div>
  );
}
