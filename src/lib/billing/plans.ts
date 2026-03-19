/**
 * Plan feature gates — defines what each subscription tier can access.
 * Used in server actions and page components to restrict features.
 */

export type Plan = "free" | "growth" | "enterprise";

export type PlanLimits = {
  maxProposals: number;          // Max active project proposals
  maxUsers: number;              // Max user accounts per tenant
  optimizationModes: string[];   // Allowed feasibility optimization modes
  auditLog: boolean;             // Access to audit log
  advancedAnalytics: boolean;    // Advanced dashboard analytics
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxProposals: 3,
    maxUsers: 5,
    optimizationModes: ["max_feasibility"],
    auditLog: false,
    advancedAnalytics: false,
  },
  growth: {
    maxProposals: 25,
    maxUsers: 30,
    optimizationModes: [
      "max_feasibility",
      "min_staff_count",
      "single_office_preferred",
      "multi_office_balanced",
      "min_overallocation",
    ],
    auditLog: true,
    advancedAnalytics: true,
  },
  enterprise: {
    maxProposals: Infinity,
    maxUsers: Infinity,
    optimizationModes: [
      "max_feasibility",
      "min_staff_count",
      "single_office_preferred",
      "multi_office_balanced",
      "min_overallocation",
    ],
    auditLog: true,
    advancedAnalytics: true,
  },
};

export function getPlanLimits(plan: Plan | string): PlanLimits {
  return PLAN_LIMITS[(plan as Plan) in PLAN_LIMITS ? (plan as Plan) : "free"];
}

export async function getTenantPlan(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  tenantId: string
): Promise<Plan> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("tenant_id", tenantId)
    .single();

  if (!data || data.status === "canceled") return "free";
  return (data.plan as Plan) ?? "free";
}
