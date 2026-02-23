import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import {
  getProjectHealthStatus,
  getProjectHealthLabel,
  getProjectHealthColour,
} from "@/lib/utils/projectHealth";

export default async function ProjectsPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();

  const { data: projects } = await supabase
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

  // Fetch actual hours per project
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
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Projects</h1>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700">
                Project
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700">
                Client
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700">
                Estimated
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-zinc-700">
                Actual
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700">
                Health
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {projects?.map((project) => {
              const actual = actualByProject[project.id] ?? 0;
              const estimated = project.estimated_hours ?? 0;
              const health = getProjectHealthStatus(actual, project.estimated_hours);

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
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    {project.client_name ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">
                    {estimated > 0 ? `${estimated}h` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">
                    {actual}h
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${getProjectHealthColour(health)}`}>
                      {getProjectHealthLabel(health)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    {project.status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(!projects || projects.length === 0) && (
        <p className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-500">
          No projects yet.
        </p>
      )}
    </div>
  );
}
