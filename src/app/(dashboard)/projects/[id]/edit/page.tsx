import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ProjectForm } from "../../ProjectForm";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role !== "administrator") {
    redirect("/projects");
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, client_name, estimated_hours, start_date, end_date, status")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!project) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-zinc-600 hover:underline">
          ← {project.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Edit project</h1>
      </div>

      <ProjectForm
        project={{
          id: project.id,
          name: project.name,
          client_name: project.client_name,
          estimated_hours: project.estimated_hours,
          start_date: project.start_date,
          end_date: project.end_date,
          status: project.status,
        }}
      />
    </div>
  );
}
