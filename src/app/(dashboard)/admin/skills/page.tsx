import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import SkillsCatalogManager from "@/app/(dashboard)/settings/skills/SkillsCatalogManager";
import type { SkillItem } from "@/app/api/skills/route";

function normalizeRelatedEmail(
  relation:
    | { users?: { email?: string | null } | { email?: string | null }[] | null }
    | { users?: { email?: string | null } | { email?: string | null }[] | null }[]
    | null
): string | null {
  const profile = Array.isArray(relation) ? relation[0] : relation;
  if (!profile) return null;
  const users = profile.users;
  const user = Array.isArray(users) ? users[0] : users;
  return typeof user?.email === "string" && user.email.trim().length > 0
    ? user.email
    : null;
}

function normalizeRelatedProjectName(
  relation:
    | { name?: string | null }
    | { name?: string | null }[]
    | null
): string | null {
  const project = Array.isArray(relation) ? relation[0] : relation;
  return typeof project?.name === "string" && project.name.trim().length > 0
    ? project.name
    : null;
}

export default async function AdminSkillsPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) redirect("/login");

  const canManageSkills = hasPermission(user.role, "assignments:manage");
  if (!canManageSkills) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="app-page-title">Skill catalog</h1>
        <p className="app-alert app-alert-error">
          You do not have permission to manage skills.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  const [{ data: skillRows }, { data: staffSkillRows }, { data: projectRequirementRows }] =
    await Promise.all([
      admin
        .from("skills")
        .select("id, name")
        .eq("tenant_id", user.tenantId)
        .order("name", { ascending: true }),
      admin
        .from("staff_skills")
        .select("skill_id, staff_id, staff_profiles(id, users(email))")
        .eq("tenant_id", user.tenantId),
      admin
        .from("project_skill_requirements")
        .select("skill_id, project_id, projects(id, name)")
        .eq("tenant_id", user.tenantId),
    ]);

  const staffBySkill = new Map<string, Map<string, string>>();
  for (const row of staffSkillRows ?? []) {
    const perSkill = staffBySkill.get(row.skill_id) ?? new Map<string, string>();
    if (!perSkill.has(row.staff_id)) {
      perSkill.set(
        row.staff_id,
        normalizeRelatedEmail(row.staff_profiles) ?? `Staff ${row.staff_id}`
      );
    }
    staffBySkill.set(row.skill_id, perSkill);
  }

  const projectsBySkill = new Map<string, Map<string, string>>();
  for (const row of projectRequirementRows ?? []) {
    const perSkill =
      projectsBySkill.get(row.skill_id) ?? new Map<string, string>();
    if (!perSkill.has(row.project_id)) {
      perSkill.set(
        row.project_id,
        normalizeRelatedProjectName(row.projects) ?? `Project ${row.project_id}`
      );
    }
    projectsBySkill.set(row.skill_id, perSkill);
  }

  const skills: SkillItem[] = (skillRows ?? []).map((row) => {
    const staff = Array.from(staffBySkill.get(row.id)?.entries() ?? []).map(
      ([id, label]) => ({ id, label })
    );
    const projects = Array.from(
      projectsBySkill.get(row.id)?.entries() ?? []
    ).map(([id, label]) => ({ id, label }));
    return {
      id: row.id,
      name: row.name ?? "",
      staff_count: staff.length,
      project_count: projects.length,
      staff,
      projects,
    };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-1">
        <Link href="/admin" className="app-link text-sm text-zinc-700">
          ← Admin
        </Link>
        <h1 className="app-page-title">Skill catalog</h1>
        <p className="app-page-subtitle">
          Create and maintain reusable skills used for staffing and forecasting.
        </p>
      </div>

      <SkillsCatalogManager initialSkills={skills} />
    </div>
  );
}
