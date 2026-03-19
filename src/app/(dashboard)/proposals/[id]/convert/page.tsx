import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { ConvertProposalForm } from "./ConvertProposalForm";
import type { ProposedTeamMemberResolved } from "./ConvertProposalForm";

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
        "id, name, client_name, proposed_start_date, proposed_end_date, estimated_hours, estimated_hours_per_week, office_scope, skills, proposed_team, notes, status"
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

  // Resolve proposed team members with staff details
  const rawProposedTeam = Array.isArray(proposal.proposed_team)
    ? (proposal.proposed_team as unknown[]).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const m = entry as { staff_id?: unknown; split_percent?: unknown };
        if (typeof m.staff_id !== "string" || typeof m.split_percent !== "number") return [];
        return [{ staff_id: m.staff_id, split_percent: m.split_percent }];
      })
    : [];

  let resolvedProposedTeam: ProposedTeamMemberResolved[] = [];

  if (rawProposedTeam.length > 0) {
    const staffIds = rawProposedTeam.map((m) => m.staff_id);
    const { data: staffRows } = await supabase
      .from("staff_profiles")
      .select("id, weekly_capacity_hours, users!inner(name, email, role, offices(name))")
      .eq("tenant_id", user.tenantId)
      .in("id", staffIds);

    const staffById = new Map(
      (staffRows ?? []).map((row) => {
        const userRecord = Array.isArray(row.users) ? row.users[0] : row.users;
        const officeRecord = Array.isArray((userRecord as { offices?: unknown })?.offices)
          ? ((userRecord as { offices: unknown[] }).offices)[0]
          : (userRecord as { offices?: unknown })?.offices;
        return [
          row.id,
          {
            name: (userRecord as { name?: string | null })?.name?.trim() || (userRecord as { email?: string })?.email || "Unknown",
            role: (userRecord as { role?: string })?.role ?? "staff",
            office: (officeRecord as { name?: string })?.name ?? "No office",
            weekly_capacity_hours: Number(row.weekly_capacity_hours),
          },
        ];
      })
    );

    resolvedProposedTeam = rawProposedTeam.flatMap((m) => {
      const staff = staffById.get(m.staff_id);
      if (!staff) return [];
      return [{
        staff_id: m.staff_id,
        split_percent: m.split_percent,
        name: staff.name,
        role: staff.role,
        office: staff.office,
        weekly_capacity_hours: staff.weekly_capacity_hours,
      }];
    });
  }

  const estimatedHoursPerWeek = typeof proposal.estimated_hours_per_week === "number"
    ? proposal.estimated_hours_per_week
    : null;

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
        proposedTeam={resolvedProposedTeam}
        estimatedHoursPerWeek={estimatedHoursPerWeek}
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
