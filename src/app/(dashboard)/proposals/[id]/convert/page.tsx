import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { ConvertProposalForm } from "./ConvertProposalForm";

export default async function ConvertProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (!hasPermission(user.role, "proposals:manage")) {
    redirect("/proposals");
  }

  const supabase = await createClient();

  const [{ data: proposal }, { data: offices }] = await Promise.all([
    supabase
      .from("project_proposals")
      .select(
        "id, name, client_name, proposed_start_date, proposed_end_date, estimated_hours, office_scope, skills, notes, status"
      )
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

  if (proposal.status !== "won") {
    redirect(`/proposals/${id}`);
  }

  const skills: Array<{ id: string; name: string; required_hours_per_week?: number }> =
    Array.isArray(proposal.skills)
      ? proposal.skills.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const s = entry as { id?: unknown; name?: unknown; required_hours_per_week?: unknown };
          if (typeof s.id !== "string" || typeof s.name !== "string") return [];
          return [
            {
              id: s.id,
              name: s.name,
              ...(typeof s.required_hours_per_week === "number"
                ? { required_hours_per_week: s.required_hours_per_week }
                : {}),
            },
          ];
        })
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/proposals/${id}`} className="app-link text-sm text-zinc-700">
          ← Back to proposal
        </Link>
        <h1 className="app-page-title mt-2">Convert to Project</h1>
        <p className="app-page-subtitle">
          Review the details below, then create the active project.
        </p>
      </div>

      <ConvertProposalForm
        proposalId={id}
        proposalName={proposal.name}
        offices={(offices ?? []).map((o) => ({ id: o.id, name: o.name }))}
        defaults={{
          name: proposal.name,
          client_name: proposal.client_name,
          start_date: proposal.proposed_start_date,
          end_date: proposal.proposed_end_date,
          estimated_hours: proposal.estimated_hours,
          office_scope: proposal.office_scope as string[] | null,
          notes: proposal.notes,
          skills,
        }}
      />
    </div>
  );
}
