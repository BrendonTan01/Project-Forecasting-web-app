import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import {
  getProjectHealthStatus,
  getProjectHealthLabel,
  getProjectHealthColour,
} from "@/lib/utils/projectHealth";
import ProjectStatusFilter from "./ProjectStatusFilter";

const statusConfig: Record<string, { label: string; colour: string }> = {
  active: { label: "Active", colour: "bg-emerald-50 text-emerald-700" },
  on_hold: { label: "On hold", colour: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", colour: "bg-blue-50 text-blue-700" },
  cancelled: { label: "Cancelled", colour: "bg-zinc-100 text-zinc-500" },
};

function formatProjectDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const { status } = await searchParams;

  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select(`
      id,
      name,
      client_name,
      estimated_hours,
      start_date,
      end_date,
      status
    `)
    .eq("tenant_id", user.tenantId)
    .order("name");

  if (status && status in statusConfig) {
    query = query.eq("status", status);
  }

  const { data: projects } = await query;

  const projectIds = projects?.map((p) => p.id) ?? [];
  const { data: actualHoursData } = projectIds.length
    ? await supabase
        .from("time_entries")
        .select("project_id, hours")
        .in("project_id", projectIds)
    : { data: [] };

  const actualByProject = (actualHoursData ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.hours);
      return acc;
    },
    {}
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">Projects</h1>
        {user.role === "administrator" && (
          <Link
            href="/projects/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Add project
          </Link>
        )}
      </div>

      <div className="mb-4">
        <ProjectStatusFilter />
        <p className="mt-2 text-sm text-zinc-600">
          Showing {projects?.length ?? 0} project{(projects?.length ?? 0) === 1 ? "" : "s"}
          {status ? ` (${statusConfig[status]?.label ?? status})` : ""}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Project
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Client
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                Estimated
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-800">
                Actual
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Start date
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                End date
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Health
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {projects?.map((project) => {
              const actual = actualByProject[project.id] ?? 0;
              const estimated = project.estimated_hours ?? 0;
              const health = getProjectHealthStatus(actual, project.estimated_hours, project.start_date);
              const badge = statusConfig[project.status] ?? {
                label: project.status,
                colour: "bg-zinc-100 text-zinc-500",
              };

              return (
                <tr key={project.id} className="border-b border-zinc-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {project.client_name ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-800">
                    {estimated > 0 ? `${estimated}h` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-800">
                    {actual}h
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {formatProjectDate(project.start_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    {formatProjectDate(project.end_date)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${getProjectHealthColour(health)}`}>
                      {getProjectHealthLabel(health)}
                    </span>
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

      {(!projects || projects.length === 0) && (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-600">
          No projects found{status ? ` with status "${statusConfig[status]?.label ?? status}"` : ""}.
        </p>
      )}
    </div>
  );
}
