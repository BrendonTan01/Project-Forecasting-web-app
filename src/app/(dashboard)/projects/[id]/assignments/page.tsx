import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import AssignmentForm from "./AssignmentForm";
import RemoveAssignmentButton from "./RemoveAssignmentButton";

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role !== "administrator") {
    redirect(`/projects/${id}`);
  }

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!project) notFound();

  // Current assignments
  const { data: assignments } = await supabase
    .from("project_assignments")
    .select(`
      id,
      allocation_percentage,
      staff_profiles (
        id,
        job_title,
        weekly_capacity_hours,
        users (email)
      )
    `)
    .eq("tenant_id", user.tenantId)
    .eq("project_id", id);

  const assignedStaffIds = new Set(
    (assignments ?? []).map((a) => {
      const sp = Array.isArray(a.staff_profiles) ? a.staff_profiles[0] : a.staff_profiles;
      return sp?.id;
    }).filter(Boolean)
  );

  // All tenant staff not yet assigned
  const { data: allStaff } = await supabase
    .from("staff_profiles")
    .select("id, job_title, users(email)")
    .eq("tenant_id", user.tenantId);

  const availableStaff = (allStaff ?? [])
    .filter((s) => !assignedStaffIds.has(s.id))
    .map((s) => {
      const users = Array.isArray(s.users) ? s.users[0] : s.users;
      return {
        id: s.id,
        email: (users as { email: string } | null)?.email ?? "Unknown",
        jobTitle: s.job_title,
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="app-link text-sm text-zinc-700">
          ← {project.name}
        </Link>
        <h1 className="app-page-title mt-2">Manage assignments</h1>
        <p className="text-sm text-zinc-600">
          Assign staff to this project and set their allocation percentage.
        </p>
      </div>

      {/* Current assignments */}
      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Current assignments</h2>
        {assignments && assignments.length > 0 ? (
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                <th className="pb-2">Staff</th>
                <th className="pb-2">Job title</th>
                <th className="pb-2 text-right">Allocation</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                    const sp = Array.isArray(a.staff_profiles) ? a.staff_profiles[0] : a.staff_profiles;
                const usersRaw = sp ? (sp as unknown as { users?: unknown }).users : null;
                const userObj = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw;
                const email = (userObj as { email?: string } | null)?.email ?? "Unknown";
                const staffId = sp?.id ?? "";
                return (
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <Link href={`/staff/${staffId}`} className="app-link text-zinc-900">
                        {email}
                      </Link>
                    </td>
                    <td className="py-2 text-sm text-zinc-600">
                      {(sp as { job_title?: string | null } | null)?.job_title ?? "-"}
                    </td>
                    <td className="py-2 text-right font-medium text-zinc-800">
                      {a.allocation_percentage}%
                    </td>
                    <td className="py-2 text-right">
                      <RemoveAssignmentButton
                        projectId={id}
                        assignmentId={a.id}
                        staffEmail={email}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500">No staff assigned yet.</p>
        )}
      </div>

      {/* Add assignment */}
      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Add assignment</h2>
        <AssignmentForm projectId={id} availableStaff={availableStaff} />
      </div>
    </div>
  );
}
