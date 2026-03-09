import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import SkillsCatalogManager from "./SkillsCatalogManager";
import type { SkillItem } from "@/app/api/skills/route";

export default async function SkillsSettingsPage() {
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
        .select("skill_id")
        .eq("tenant_id", user.tenantId),
      admin
        .from("project_skill_requirements")
        .select("skill_id")
        .eq("tenant_id", user.tenantId),
    ]);

  const staffCountBySkill = new Map<string, number>();
  for (const row of staffSkillRows ?? []) {
    staffCountBySkill.set(
      row.skill_id,
      (staffCountBySkill.get(row.skill_id) ?? 0) + 1
    );
  }

  const projectCountBySkill = new Map<string, number>();
  for (const row of projectRequirementRows ?? []) {
    projectCountBySkill.set(
      row.skill_id,
      (projectCountBySkill.get(row.skill_id) ?? 0) + 1
    );
  }

  const skills: SkillItem[] = (skillRows ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? "",
    staff_count: staffCountBySkill.get(row.id) ?? 0,
    project_count: projectCountBySkill.get(row.id) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-1">
        <Link href="/settings" className="app-link text-sm text-zinc-700">
          ← Settings
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
