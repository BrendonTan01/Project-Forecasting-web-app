import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProjectHealthStatus,
  getProjectHealthLabel,
  getProjectHealthColour,
} from "@/lib/utils/projectHealth";
import { DeleteProjectButton } from "./DeleteProjectButton";

function formatProjectDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, client_name, estimated_hours, start_date, end_date, status")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!project) notFound();

  // Actual hours
  const { data: timeEntries } = await supabase
    .from("time_entries")
    .select("hours, billable_flag")
    .eq("project_id", id)
    .eq("tenant_id", user.tenantId);

  const actualHours = timeEntries?.reduce((sum, e) => sum + Number(e.hours), 0) ?? 0;
  const billableHours = timeEntries?.filter((e) => e.billable_flag).reduce((sum, e) => sum + Number(e.hours), 0) ?? 0;
  const estimated = project.estimated_hours ?? 0;
  const health = getProjectHealthStatus(actualHours, project.estimated_hours, project.start_date);

  // Burn rate: use project schedule when available to avoid runtime-dependent calculations.
  const scheduleWeeks = project.start_date && project.end_date
    ? Math.max(
        1,
        (new Date(project.end_date).getTime() - new Date(project.start_date).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      )
    : 1;
  const burnRate = actualHours / scheduleWeeks;

  // Assignments
  const { data: assignments } = await supabase
    .from("project_assignments")
    .select(`
      id,
      allocation_percentage,
      staff_profiles (
        id,
        user_id,
        job_title,
        weekly_capacity_hours,
        users (email)
      )
    `)
    .eq("project_id", id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/projects" className="text-sm text-zinc-600 hover:underline">
            ← Projects
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{project.name}</h1>
        </div>
        {user.role === "administrator" && (
          <div className="flex gap-2">
            <Link
              href={`/projects/${id}/edit`}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Edit
            </Link>
            <DeleteProjectButton projectId={id} projectName={project.name} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Client</p>
          <p className="font-semibold text-zinc-900">{project.client_name ?? "-"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Estimated hours</p>
          <p className="font-semibold text-zinc-900">{estimated > 0 ? `${estimated}h` : "-"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Actual hours</p>
          <p className="font-semibold text-zinc-900">{actualHours}h</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Health</p>
          <p className={`font-medium ${getProjectHealthColour(health)}`}>
            {getProjectHealthLabel(health)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Start date</p>
          <p className="font-semibold text-zinc-900">{formatProjectDate(project.start_date)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">End date</p>
          <p className="font-semibold text-zinc-900">{formatProjectDate(project.end_date)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Burn rate</p>
          <p className="font-semibold text-zinc-900">{burnRate.toFixed(1)}h/week</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Billable ratio</p>
          <p className="font-semibold text-zinc-900">
            {actualHours > 0 ? `${((billableHours / actualHours) * 100).toFixed(0)}%` : "-"}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Assigned staff</h2>
        {assignments && assignments.length > 0 ? (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Staff</th>
                <th className="pb-2">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const sp = a.staff_profiles as {
                  id: string;
                  users?: { email: string } | { email: string }[] | null;
                } | { id: string; users?: { email: string } | { email: string }[] | null }[] | null;
                const staff = Array.isArray(sp) ? sp[0] : sp;
                const email = staff ? (Array.isArray(staff.users) ? staff.users[0]?.email : staff.users?.email) ?? "Unknown" : "Unknown";
                return (
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <Link
                        href={`/staff/${staff?.id}`}
                        className="text-zinc-900 hover:underline"
                      >
                        {email}
                      </Link>
                    </td>
                    <td className="py-2 font-medium text-zinc-800">{a.allocation_percentage}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-600">No staff assigned</p>
        )}
      </div>
    </div>
  );
}
