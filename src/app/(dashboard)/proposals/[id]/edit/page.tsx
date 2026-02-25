import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { ProposalForm } from "../../ProposalForm";

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role !== "administrator") {
    redirect("/proposals");
  }

  const supabase = await createClient();
  const { data: proposal } = await supabase
    .from("project_proposals")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!proposal) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/proposals/${id}`} className="text-sm text-zinc-600 hover:underline">
          ← {proposal.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Edit proposal</h1>
      </div>
      <ProposalForm
        proposal={{
          id: proposal.id,
          name: proposal.name,
          client_name: proposal.client_name,
          proposed_start_date: proposal.proposed_start_date,
          proposed_end_date: proposal.proposed_end_date,
          estimated_hours: proposal.estimated_hours,
          expected_revenue: proposal.expected_revenue,
          manual_estimated_cost: proposal.manual_estimated_cost,
          derived_estimated_cost_override: proposal.derived_estimated_cost_override,
          risk_allowance_amount: proposal.risk_allowance_amount,
          win_probability_percent: proposal.win_probability_percent,
          schedule_confidence_percent: proposal.schedule_confidence_percent,
          cross_office_dependency_percent: proposal.cross_office_dependency_percent,
          client_quality_score: proposal.client_quality_score,
          cost_source_preference: proposal.cost_source_preference,
          status: proposal.status,
          notes: proposal.notes,
        }}
      />
    </div>
  );
}
