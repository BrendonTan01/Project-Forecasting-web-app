import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ProjectForm } from "../../ProjectForm";
import { isOfficeInScope } from "@/lib/office-scope";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (!hasPermission(user.role, "projects:manage")) {
    redirect("/projects");
  }
  if (user.role === "manager" && !user.officeId) {
    redirect("/projects");
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, client_name, estimated_hours, start_date, end_date, status, office_scope")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!project) notFound();
  if (user.role === "manager" && !isOfficeInScope(project.office_scope, user.officeId)) {
    notFound();
  }

  let officesQuery = supabase
    .from("offices")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .order("name");
  if (user.role === "manager" && user.officeId) {
    officesQuery = officesQuery.eq("id", user.officeId);
  }
  const { data: offices } = await officesQuery;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="app-link text-sm text-zinc-700">
          ← {project.name}
        </Link>
        <h1 className="app-page-title mt-2">Edit project</h1>
      </div>

      <ProjectForm
        offices={(offices ?? []).map((o) => ({ id: o.id, name: o.name }))}
        project={{
          id: project.id,
          name: project.name,
          client_name: project.client_name,
          estimated_hours: project.estimated_hours,
          start_date: project.start_date,
          end_date: project.end_date,
          status: project.status,
          office_scope: Array.isArray(project.office_scope)
            ? (project.office_scope as string[])
            : null,
        }}
      />
    </div>
  );
}
