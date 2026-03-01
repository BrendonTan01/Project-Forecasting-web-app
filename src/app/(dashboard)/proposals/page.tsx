import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";

const proposalStatusConfig: Record<string, { label: string; colour: string }> = {
  draft: { label: "Draft", colour: "bg-zinc-100 text-zinc-700" },
  submitted: { label: "Submitted", colour: "bg-blue-50 text-blue-700" },
  won: { label: "Won", colour: "bg-emerald-50 text-emerald-700" },
  lost: { label: "Lost", colour: "bg-red-50 text-red-700" },
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
      status
    `)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  if (status && status in proposalStatusConfig) {
    query = query.eq("status", status);
  }

  const { data: proposals } = await query;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="app-page-title">Project Proposals</h1>
          <p className="app-page-subtitle">
            Future opportunities — assess staff availability before bidding.
          </p>
        </div>
        {user.role === "administrator" && (
          <Link
            href="/proposals/new"
            className="app-btn app-btn-primary focus-ring px-4 py-2 text-sm"
          >
            Add proposal
          </Link>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <Link
          href="/proposals"
          className="app-btn app-btn-secondary focus-ring rounded-full px-3 py-1 text-xs"
        >
          All
        </Link>
        {Object.entries(proposalStatusConfig).map(([key, config]) => (
          <Link
            key={key}
            href={`/proposals?status=${key}`}
            className="app-btn app-btn-secondary focus-ring rounded-full px-3 py-1 text-xs"
          >
            {config.label}
          </Link>
        ))}
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Showing {proposals?.length ?? 0} proposal{(proposals?.length ?? 0) === 1 ? "" : "s"}
        {status ? ` (${proposalStatusConfig[status]?.label ?? status})` : ""}
      </p>

      <div className="app-card overflow-hidden">
        <table className="app-table min-w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Proposal
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Client
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Timeline
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                Total hours
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                Hrs / week
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {proposals?.map((proposal) => {
              const badge = proposalStatusConfig[proposal.status] ?? {
                label: proposal.status,
                colour: "bg-zinc-100 text-zinc-500",
              };
              const timeline =
                proposal.proposed_start_date || proposal.proposed_end_date
                  ? `${proposal.proposed_start_date ?? "?"} → ${proposal.proposed_end_date ?? "?"}`
                  : "—";

              return (
                <tr key={proposal.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/proposals/${proposal.id}`} className="app-link font-medium text-zinc-900">
                      {proposal.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {proposal.client_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">{timeline}</td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-900">
                    {fmtHours(proposal.estimated_hours)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-900">
                    {fmtHours(proposal.estimated_hours_per_week)}
                  </td>
                  <td className="px-4 py-3">
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

      {(!proposals || proposals.length === 0) && (
        <p className="app-empty-state mt-4 p-8 text-center">
          No proposals found
          {status ? ` with status "${proposalStatusConfig[status]?.label ?? status}"` : ""}.
        </p>
      )}
    </div>
  );
}
