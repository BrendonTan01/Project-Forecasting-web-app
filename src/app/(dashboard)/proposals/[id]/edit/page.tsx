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

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/proposals/${id}`} className="app-link text-sm text-zinc-700">
          ← {proposal.name}
        </Link>
        <h1 className="app-page-title mt-2">Edit proposal</h1>
      </div>
      <ProposalForm
        offices={offices ?? []}
        proposal={{
          id: proposal.id,
          name: proposal.name,
          client_name: proposal.client_name,
          proposed_start_date: proposal.proposed_start_date,
          proposed_end_date: proposal.proposed_end_date,
          estimated_hours: proposal.estimated_hours,
          estimated_hours_per_week: proposal.estimated_hours_per_week,
          office_scope: proposal.office_scope as string[] | null,
          optimization_mode: proposal.optimization_mode,
          status: proposal.status,
          notes: proposal.notes,
        }}
      />
    </div>
  );
}
