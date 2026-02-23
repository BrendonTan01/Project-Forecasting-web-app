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
        <Link href="/projects" className="text-sm text-zinc-600 hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Add new project</h1>
      </div>

      <ProjectForm />
    </div>
  );
}
