import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { DeleteProposalButton } from "./DeleteProposalButton";
import { FeasibilityAnalysis } from "./FeasibilityAnalysis";
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

  const supabase = await createClient();

  const [{ data: proposal }, { data: offices }] = await Promise.all([
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
  ]);

  if (!proposal) notFound();

  const badge = statusConfig[proposal.status] ?? {
    label: proposal.status,
    colour: "bg-zinc-100 text-zinc-500",
  };

  const officeScope = proposal.office_scope as string[] | null;
  const optimizationMode = normalizeProposalOptimizationMode(proposal.optimization_mode);

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
          {user.role === "administrator" && (
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

      {/* Feasibility analysis */}
      <div className="app-card p-4">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-zinc-900">Staff feasibility analysis</h2>
          <p className="text-sm text-zinc-500">
            Simulates how much of this project can be absorbed by current staff, accounting for
            existing project commitments and approved leave.
          </p>
        </div>
        <FeasibilityAnalysis
          proposalId={id}
          allOffices={offices ?? []}
          initialOfficeScope={officeScope}
          initialOptimizationMode={optimizationMode}
          initialResult={initialFeasibility}
        />
      </div>

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
