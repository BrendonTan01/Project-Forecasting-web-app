import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { DeleteProposalButton } from "./DeleteProposalButton";
import { ProposalSimulationSection } from "./ProposalSimulationSection";
import { normalizeProposalOptimizationMode } from "../optimization-modes";

const statusConfig: Record<string, { label: string; colour: string }> = {
  draft: { label: "Draft", colour: "bg-zinc-100 text-zinc-700" },
  submitted: { label: "Submitted", colour: "bg-blue-50 text-blue-700" },
  won: { label: "Won", colour: "bg-emerald-50 text-emerald-700" },
  lost: { label: "Lost", colour: "bg-red-50 text-red-700" },
  converted: { label: "Converted", colour: "bg-violet-50 text-violet-700" },
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

  const [{ data: proposal }, { data: offices }] = await Promise.all([
    supabase
      .from("project_proposals")
      .select("id, name, client_name, proposed_start_date, proposed_end_date, estimated_hours, estimated_hours_per_week, win_probability, skills, office_scope, optimization_mode, status, notes")
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

  // If this proposal has been converted, look up the linked project.
  let linkedProjectId: string | null = null;
  if (proposal.status === "converted") {
    const { data: linkedProject } = await supabase
      .from("projects")
      .select("id")
      .eq("source_proposal_id", id)
      .eq("tenant_id", user.tenantId)
      .maybeSingle();
    linkedProjectId = linkedProject?.id ?? null;
  }

  const badge = statusConfig[proposal.status] ?? {
    label: proposal.status,
    colour: "bg-zinc-100 text-zinc-500",
  };

  const officeScope = proposal.office_scope as string[] | null;
  const proposalSkills: Array<{ id: string; name: string; required_hours_per_week?: number }> = Array.isArray(
    proposal.skills
  )
    ? proposal.skills.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const maybeSkill = entry as {
          id?: unknown;
          name?: unknown;
          required_hours_per_week?: unknown;
        };
        if (typeof maybeSkill.id !== "string" || typeof maybeSkill.name !== "string") {
          return [];
        }
        if (typeof maybeSkill.required_hours_per_week === "number") {
          return [{
            id: maybeSkill.id,
            name: maybeSkill.name,
            required_hours_per_week: maybeSkill.required_hours_per_week,
          }];
        }
        return [{ id: maybeSkill.id, name: maybeSkill.name }];
      })
    : [];
  const optimizationMode = normalizeProposalOptimizationMode(proposal.optimization_mode);

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
              {proposal.status === "won" && (
                <Link
                  href={`/proposals/${id}/convert`}
                  className="app-btn app-btn-primary focus-ring px-4 py-2 text-sm"
                >
                  Convert to Project
                </Link>
              )}
              {proposal.status !== "converted" && (
                <Link
                  href={`/proposals/${id}/edit`}
                  className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm"
                >
                  Edit
                </Link>
              )}
              <DeleteProposalButton proposalId={id} proposalName={proposal.name} />
            </>
          )}
        </div>
      </div>

      {/* Converted callout */}
      {proposal.status === "converted" && (
        <div className="flex items-center justify-between rounded-md border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm text-violet-800">
            This proposal has been converted to an active project.
          </p>
          {linkedProjectId && (
            <Link
              href={`/projects/${linkedProjectId}`}
              className="ml-4 shrink-0 text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
            >
              View project →
            </Link>
          )}
        </div>
      )}

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
          <p className="text-sm font-medium text-zinc-500">Win probability</p>
          <p className="mt-1 font-semibold text-zinc-900">
            {Math.min(100, Math.max(0, Number(proposal.win_probability ?? 50)))}%
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
        <div className="app-card p-4">
          <p className="text-sm font-medium text-zinc-500">Skills needed</p>
          <p className="mt-1 font-semibold text-zinc-900">
            {proposalSkills.length > 0
              ? `${proposalSkills.length} skill${proposalSkills.length > 1 ? "s" : ""}`
              : "Not set"}
          </p>
        </div>
      </div>

      {proposalSkills.length > 0 && (
        <div className="app-card p-4">
          <h2 className="mb-2 font-semibold text-zinc-900">Required skills</h2>
          <div className="flex flex-wrap gap-2">
            {proposalSkills.map((skill) => (
              <span
                key={skill.id}
                className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700"
              >
                {skill.name}
                {skill.required_hours_per_week !== undefined ? ` (${skill.required_hours_per_week}h/wk)` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Proposal impact + feasibility analysis */}
      <ProposalSimulationSection
        proposalId={id}
        allOffices={offices ?? []}
        initialOfficeScope={officeScope}
        initialOptimizationMode={optimizationMode}
        initialResult={null}
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
