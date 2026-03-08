import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { DeleteProposalButton } from "./DeleteProposalButton";
import { ProposalSimulationSection } from "./ProposalSimulationSection";
import { computeFeasibility } from "./feasibility-actions";
import { normalizeProposalOptimizationMode } from "../optimization-modes";

const statusConfig: Record<string, { label: string; colour: string }> = {
  draft: { label: "Draft", colour: "bg-zinc-100 text-zinc-700" },
  submitted: { label: "Submitted", colour: "bg-blue-50 text-blue-700" },
  won: { label: "Won", colour: "bg-emerald-50 text-emerald-700" },
  lost: { label: "Lost", colour: "bg-red-50 text-red-700" },
};

function fmtHours(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 10) / 10}h`;
}

function fmtWeeks(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const diffDays =
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
  const weeks = Math.round((diffDays / 7) * 10) / 10;
  return `${weeks} week${weeks !== 1 ? "s" : ""}`;
}

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  const canManageProposals = hasPermission(user.role, "proposals:manage");

  const supabase = await createClient();

  const [{ data: proposal }, { data: offices }, { data: staffRates }] = await Promise.all([
    supabase
      .from("project_proposals")
      .select("id, name, client_name, proposed_start_date, proposed_end_date, estimated_hours, estimated_hours_per_week, office_scope, optimization_mode, status, notes")
      .eq("id", id)
      .eq("tenant_id", user.tenantId)
      .single(),
    supabase
      .from("offices")
      .select("id, name")
      .eq("tenant_id", user.tenantId)
      .order("name"),
    supabase
      .from("staff_profiles")
      .select("billable_rate, cost_rate")
      .eq("tenant_id", user.tenantId)
      .not("billable_rate", "is", null),
  ]);

  if (!proposal) notFound();

  const badge = statusConfig[proposal.status] ?? {
    label: proposal.status,
    colour: "bg-zinc-100 text-zinc-500",
  };

  const officeScope = proposal.office_scope as string[] | null;
  const optimizationMode = normalizeProposalOptimizationMode(proposal.optimization_mode);

  // Financial forecast: estimated revenue + cost from staff rates (if available)
  const rateCount = staffRates?.length ?? 0;
  const avgBillableRate =
    rateCount > 0
      ? (staffRates ?? []).reduce((sum, r) => sum + Number(r.billable_rate ?? 0), 0) / rateCount
      : null;
  const avgCostRate =
    rateCount > 0 && (staffRates ?? []).some((r) => r.cost_rate !== null)
      ? (staffRates ?? []).reduce((sum, r) => sum + Number(r.cost_rate ?? 0), 0) / rateCount
      : null;
  const estimatedRevenue =
    avgBillableRate !== null && proposal?.estimated_hours
      ? avgBillableRate * Number(proposal.estimated_hours)
      : null;
  const estimatedCost =
    avgCostRate !== null && proposal?.estimated_hours
      ? avgCostRate * Number(proposal.estimated_hours)
      : null;
  const estimatedMargin =
    estimatedRevenue !== null && estimatedCost !== null
      ? estimatedRevenue - estimatedCost
      : null;

  // Run initial feasibility computation server-side
  const initialFeasibility = await computeFeasibility(id, officeScope, false, 120, optimizationMode);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/proposals" className="app-link text-sm text-zinc-700">
            ← Proposals
          </Link>
          <h1 className="app-page-title mt-2">{proposal.name}</h1>
          <p className="text-sm text-zinc-600">{proposal.client_name ?? "No client set"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badge.colour}`}>
            {badge.label}
          </span>
          {canManageProposals && (
            <>
              <Link
                href={`/proposals/${id}/edit`}
                className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm"
              >
                Edit
              </Link>
              <DeleteProposalButton proposalId={id} proposalName={proposal.name} />
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="app-card p-4">
          <p className="text-sm font-medium text-zinc-500">Timeline</p>
          <p className="mt-1 font-semibold text-zinc-900">
            {proposal.proposed_start_date ?? "?"} → {proposal.proposed_end_date ?? "?"}
          </p>
          <p className="text-xs text-zinc-400">
            {fmtWeeks(proposal.proposed_start_date, proposal.proposed_end_date)}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-sm font-medium text-zinc-500">Total hours</p>
          <p className="mt-1 font-semibold text-zinc-900">
            {fmtHours(proposal.estimated_hours)}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-sm font-medium text-zinc-500">Hours per week</p>
          <p className="mt-1 font-semibold text-zinc-900">
            {fmtHours(proposal.estimated_hours_per_week)}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-sm font-medium text-zinc-500">Staff scope</p>
          <p className="mt-1 font-semibold text-zinc-900">
            {officeScope && officeScope.length > 0
              ? `${officeScope.length} office${officeScope.length > 1 ? "s" : ""}`
              : "All offices"}
          </p>
        </div>
      </div>

      {/* Financial forecast */}
      {estimatedRevenue !== null && (
        <div className="app-card p-4">
          <h2 className="mb-1 font-semibold text-zinc-900">Financial forecast</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Based on average billable/cost rates across {rateCount} staff member{rateCount !== 1 ? "s" : ""} with rates configured.
            Figures are estimates — actual rates depend on which staff are assigned.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-zinc-200 p-3">
              <p className="text-sm font-medium text-zinc-500">Est. revenue</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(estimatedRevenue)}
              </p>
              <p className="text-xs text-zinc-400">avg ${avgBillableRate?.toFixed(0)}/h × {proposal.estimated_hours}h</p>
            </div>
            {estimatedCost !== null && (
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-sm font-medium text-zinc-500">Est. cost</p>
                <p className="mt-1 text-xl font-semibold text-zinc-900">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(estimatedCost)}
                </p>
                <p className="text-xs text-zinc-400">avg ${avgCostRate?.toFixed(0)}/h × {proposal.estimated_hours}h</p>
              </div>
            )}
            {estimatedMargin !== null && (
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-sm font-medium text-zinc-500">Est. margin</p>
                <p className={`mt-1 text-xl font-semibold ${estimatedMargin >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(estimatedMargin)}
                </p>
                <p className="text-xs text-zinc-400">
                  {estimatedRevenue > 0 ? ((estimatedMargin / estimatedRevenue) * 100).toFixed(1) : "0"}% margin
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proposal impact + feasibility analysis */}
      <ProposalSimulationSection
        proposalId={id}
        allOffices={offices ?? []}
        initialOfficeScope={officeScope}
        initialOptimizationMode={optimizationMode}
        initialResult={initialFeasibility}
      />

      {/* Notes */}
      {proposal.notes?.trim() && (
        <div className="app-card p-4">
          <h2 className="mb-2 font-semibold text-zinc-900">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-700">{proposal.notes}</p>
        </div>
      )}
    </div>
  );
}
