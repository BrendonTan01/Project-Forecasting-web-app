import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "../ProjectForm";

export default async function NewProjectPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (!hasPermission(user.role, "projects:manage")) {
    redirect("/projects");
  }
  if (user.role === "manager" && !user.officeId) {
    redirect("/projects");
  }
  const supabase = await createClient();
  let query = supabase
    .from("offices")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .order("name");
  if (user.role === "manager" && user.officeId) {
    query = query.eq("id", user.officeId);
  }
  const { data: offices } = await query;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="app-link text-sm text-zinc-700">
          ← Projects
        </Link>
        <h1 className="app-page-title mt-2">Add new project</h1>
      </div>

      <ProjectForm offices={(offices ?? []).map((o) => ({ id: o.id, name: o.name }))} />
    </div>
  );
}
