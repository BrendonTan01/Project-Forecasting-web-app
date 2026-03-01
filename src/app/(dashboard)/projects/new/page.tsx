import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProjectForm } from "../ProjectForm";

export default async function NewProjectPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role !== "administrator") {
    redirect("/projects");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="app-link text-sm text-zinc-700">
          ← Projects
        </Link>
        <h1 className="app-page-title mt-2">Add new project</h1>
      </div>

      <ProjectForm />
    </div>
  );
}
