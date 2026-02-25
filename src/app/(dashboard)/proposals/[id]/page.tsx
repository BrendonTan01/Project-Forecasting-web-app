import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { DeleteProposalButton } from "./DeleteProposalButton";

const statusConfig: Record<string, { label: string; colour: string }> = {
  draft: { label: "Draft", colour: "bg-zinc-100 text-zinc-700" },
  submitted: { label: "Submitted", colour: "bg-blue-50 text-blue-700" },
  won: { label: "Won", colour: "bg-emerald-50 text-emerald-700" },
  lost: { label: "Lost", colour: "bg-red-50 text-red-700" },
};

function fmtCurrency(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPercent(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)}%`;
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
  const { data: proposal } = await supabase
    .from("project_proposals")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!proposal) notFound();
  const badge = statusConfig[proposal.status] ?? {
    label: proposal.status,
    colour: "bg-zinc-100 text-zinc-500",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/proposals" className="text-sm text-zinc-600 hover:underline">
            ← Proposals
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{proposal.name}</h1>
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
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Edit
              </Link>
              <DeleteProposalButton proposalId={id} proposalName={proposal.name} />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Timeline</p>
          <p className="font-semibold text-zinc-900">
            {proposal.proposed_start_date ?? "?"} → {proposal.proposed_end_date ?? "?"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Estimated hours</p>
          <p className="font-semibold text-zinc-900">
            {proposal.estimated_hours !== null ? `${proposal.estimated_hours}h` : "-"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Expected revenue</p>
          <p className="font-semibold text-zinc-900">{fmtCurrency(proposal.expected_revenue)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Risk allowance</p>
          <p className="font-semibold text-zinc-900">{fmtCurrency(proposal.risk_allowance_amount)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Manual estimated cost</p>
          <p className="font-semibold text-zinc-900">{fmtCurrency(proposal.manual_estimated_cost)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Derived override cost</p>
          <p className="font-semibold text-zinc-900">{fmtCurrency(proposal.derived_estimated_cost_override)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Cost source preference</p>
          <p className="font-semibold text-zinc-900">
            {proposal.cost_source_preference === "derived_first" ? "Derived first" : "Manual first"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Win probability</p>
          <p className="font-semibold text-zinc-900">{fmtPercent(proposal.win_probability_percent)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Schedule confidence</p>
          <p className="font-semibold text-zinc-900">{fmtPercent(proposal.schedule_confidence_percent)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Cross-office dependency</p>
          <p className="font-semibold text-zinc-900">{fmtPercent(proposal.cross_office_dependency_percent)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Client quality score</p>
          <p className="font-semibold text-zinc-900">{fmtPercent(proposal.client_quality_score)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 font-semibold text-zinc-900">Notes</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-700">
          {proposal.notes?.trim() ? proposal.notes : "No notes provided."}
        </p>
      </div>
    </div>
  );
}
