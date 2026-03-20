import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { isOfficeInScope } from "@/lib/office-scope";

const proposalStatusConfig: Record<string, { label: string; colour: string }> = {
  draft: { label: "Draft", colour: "bg-zinc-100 text-zinc-700" },
  submitted: { label: "Submitted", colour: "bg-blue-50 text-blue-700" },
  won: { label: "Won", colour: "bg-emerald-50 text-emerald-700" },
  lost: { label: "Lost", colour: "bg-red-50 text-red-700" },
  converted: { label: "Converted", colour: "bg-violet-50 text-violet-700" },
};

function fmtHours(h: number | null): string {
  if (h === null || h === undefined) return "—";
  return `${Math.round(h)}h`;
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  const canManageProposals = hasPermission(user.role, "proposals:manage");
  const managerOfficeId = user.role === "manager" ? user.officeId : null;
  const managerMissingOffice = user.role === "manager" && !managerOfficeId;

  if (managerMissingOffice) {
    return (
      <div className="app-card p-6">
        <h1 className="app-page-title">Project Proposals</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Your manager account is not assigned to an office yet. Ask an administrator to set your office to access scoped proposals.
        </p>
      </div>
    );
  }

  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("project_proposals")
    .select(`
      id,
      name,
      client_name,
      proposed_start_date,
      proposed_end_date,
      estimated_hours,
      estimated_hours_per_week,
      status,
      office_scope
    `)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  if (status && status in proposalStatusConfig) {
    query = query.eq("status", status);
  }

  const { data: proposals } = await query;
  const proposalList = (proposals ?? []).filter((proposal) =>
    user.role === "manager" ? isOfficeInScope((proposal as { office_scope?: unknown }).office_scope, managerOfficeId) : true
  );
  const countsByStatus = proposalList.reduce<Record<string, number>>((acc, proposal) => {
    acc[proposal.status] = (acc[proposal.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div>
          <p className="app-section-caption">Pipeline planning</p>
          <h1 className="app-page-title">Project Proposals</h1>
          <p className="app-page-subtitle">
            Future opportunities — assess staff availability before bidding.
          </p>
        </div>
        {canManageProposals && (
          <Link
            href="/proposals/new"
            className="app-btn app-btn-primary focus-ring w-full px-4 py-2 text-sm sm:w-auto"
          >
            Add proposal
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="app-metric-card">
          <p className="app-metric-label">Total proposals</p>
          <p className="app-metric-value mt-1">{proposalList.length}</p>
        </div>
        {Object.entries(proposalStatusConfig).map(([key, config]) => (
          <div key={key} className="app-metric-card">
            <p className="app-metric-label">{config.label}</p>
            <p className="app-metric-value mt-1">{countsByStatus[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="app-toolbar flex flex-nowrap gap-2 overflow-x-auto p-2 sm:flex-wrap sm:overflow-visible">
        <Link
          href="/proposals"
            className={`app-btn focus-ring shrink-0 rounded-full px-3 py-1 text-xs ${
            !status ? "app-btn-primary" : "app-btn-secondary"
          }`}
        >
          All
        </Link>
        {Object.entries(proposalStatusConfig).map(([key, config]) => (
          <Link
            key={key}
            href={`/proposals?status=${key}`}
            className={`app-btn focus-ring shrink-0 rounded-full px-3 py-1 text-xs ${
              status === key ? "app-btn-primary" : "app-btn-secondary"
            }`}
          >
            {config.label} ({countsByStatus[key] ?? 0})
          </Link>
        ))}
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Showing {proposalList.length} proposal{proposalList.length === 1 ? "" : "s"}
        {status ? ` (${proposalStatusConfig[status]?.label ?? status})` : ""}
      </p>

      <div className="app-table-wrap">
        <table className="app-table app-table-comfortable min-w-full">
          <thead>
            <tr>
              <th className="text-left">
                Proposal
              </th>
              <th className="text-left">
                Client
              </th>
              <th className="text-left">
                Timeline
              </th>
              <th className="text-right">
                Total hours
              </th>
              <th className="text-right">
                Hrs / week
              </th>
              <th className="text-left">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {proposalList.map((proposal) => {
              const badge = proposalStatusConfig[proposal.status] ?? {
                label: proposal.status,
                colour: "bg-zinc-100 text-zinc-500",
              };
              const timeline =
                proposal.proposed_start_date || proposal.proposed_end_date
                  ? `${proposal.proposed_start_date ?? "?"} → ${proposal.proposed_end_date ?? "?"}`
                  : "—";

              return (
                <tr key={proposal.id}>
                  <td>
                    <Link href={`/proposals/${proposal.id}`} className="app-link font-medium text-zinc-900">
                      {proposal.name}
                    </Link>
                  </td>
                  <td className="text-sm text-zinc-700">
                    {proposal.client_name ?? "—"}
                  </td>
                  <td className="text-sm text-zinc-700">{timeline}</td>
                  <td className="text-right text-sm text-zinc-900">
                    {fmtHours(proposal.estimated_hours)}
                  </td>
                  <td className="text-right text-sm text-zinc-900">
                    {fmtHours(proposal.estimated_hours_per_week)}
                  </td>
                  <td>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.colour}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {proposalList.length === 0 && (
        <p className="app-empty-state mt-4 p-8 text-center">
          No proposals found
          {status ? ` with status "${proposalStatusConfig[status]?.label ?? status}"` : ""}.
        </p>
      )}
    </div>
  );
}
