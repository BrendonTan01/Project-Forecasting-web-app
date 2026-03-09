import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scheduleForecastRecalculation,
  scheduleHiringPredictionsRecalculation,
} from "@/lib/forecast/engine";

export type SkillItem = {
  id: string;
  name: string;
  staff_count?: number;
  project_count?: number;
};

export type SkillsListResponse = {
  skills: SkillItem[];
};

type SkillDeleteImpactResponse = {
  skill: SkillItem;
  staff: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; label: string }>;
  proposals: Array<{ id: string; label: string }>;
};

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

async function loadSkillDeleteImpact(
  tenantId: string,
  skillId: string
): Promise<SkillDeleteImpactResponse | null> {
  const admin = createAdminClient();
  const { data: skill } = await admin
    .from("skills")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("id", skillId)
    .single();

  if (!skill) return null;

  const [staffLinksResult, projectLinksResult] = await Promise.all([
    admin
      .from("staff_skills")
      .select("staff_id, staff_profiles(id, users(email))")
      .eq("tenant_id", tenantId)
      .eq("skill_id", skillId),
    admin
      .from("project_skill_requirements")
      .select("project_id, projects(id, name)")
      .eq("tenant_id", tenantId)
      .eq("skill_id", skillId),
  ]);

  const staff = (staffLinksResult.data ?? []).map((row) => ({
    id: row.staff_id,
    label: normalizeRelatedEmail(row.staff_profiles) ?? `Staff ${row.staff_id}`,
  }));

  const projects = (projectLinksResult.data ?? []).map((row) => ({
    id: row.project_id,
    label:
      normalizeRelatedProjectName(row.projects) ?? `Project ${row.project_id}`,
  }));

  // Compatibility: include proposal list when using legacy project_proposals.skills JSON.
  const proposals: Array<{ id: string; label: string }> = [];
  const { data: proposalRows, error: proposalReadError } = await admin
    .from("project_proposals")
    .select("id, name, skills")
    .eq("tenant_id", tenantId)
    .not("skills", "is", null);

  if (!proposalReadError && proposalRows) {
    for (const proposal of proposalRows) {
      const raw = proposal.skills;
      if (!Array.isArray(raw)) continue;
      const containsSkill = raw.some((entry) => {
        if (typeof entry === "string") {
          return (
            entry.trim().toLowerCase() === (skill.name ?? "").trim().toLowerCase()
          );
        }
        if (entry && typeof entry === "object") {
          const obj = entry as { id?: unknown; name?: unknown };
          const matchId = typeof obj.id === "string" && obj.id.trim() === skillId;
          const matchName =
            typeof obj.name === "string" &&
            obj.name.trim().toLowerCase() ===
              (skill.name ?? "").trim().toLowerCase();
          return matchId || matchName;
        }
        return false;
      });
      if (!containsSkill) continue;
      proposals.push({
        id: proposal.id,
        label:
          typeof proposal.name === "string" && proposal.name.trim().length > 0
            ? proposal.name
            : `Proposal ${proposal.id}`,
      });
    }
  }

  return {
    skill: {
      id: skill.id,
      name: skill.name ?? "",
    },
    staff,
    projects,
    proposals,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const impactSkillId =
    request.nextUrl.searchParams.get("impact_skill_id")?.trim() ?? "";
  if (impactSkillId) {
    try {
      const impact = await loadSkillDeleteImpact(user.tenantId, impactSkillId);
      if (!impact) {
        return NextResponse.json({ error: "Skill not found" }, { status: 404 });
      }
      return NextResponse.json(impact);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to load skill impact" },
        { status: 500 }
      );
    }
  }

  try {
    const skills = await loadTenantSkills(user.tenantId);
    return NextResponse.json({ skills } satisfies SkillsListResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load skills" },
      { status: 500 }
    );
  }
}

type CreateSkillBody = {
  name: string;
};

type UpdateSkillBody = {
  id: string;
  name: string;
};

type DeleteSkillBody = {
  id: string;
};

function normalizeSkillName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

async function loadTenantSkills(tenantId: string): Promise<SkillItem[]> {
  const admin = createAdminClient();
  const [
    { data: skillRows, error: skillError },
    { data: staffSkillRows, error: staffSkillError },
    { data: projectRequirementRows, error: projectRequirementError },
  ] = await Promise.all([
      admin
        .from("skills")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
      admin.from("staff_skills").select("skill_id").eq("tenant_id", tenantId),
      admin
        .from("project_skill_requirements")
        .select("skill_id")
        .eq("tenant_id", tenantId),
  ]);

  if (skillError) {
    throw new Error(skillError.message);
  }
  if (staffSkillError) {
    throw new Error(staffSkillError.message);
  }
  if (projectRequirementError) {
    throw new Error(projectRequirementError.message);
  }

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

  return (skillRows ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? "",
    staff_count: staffCountBySkill.get(row.id) ?? 0,
    project_count: projectCountBySkill.get(row.id) ?? 0,
  }));
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user.role, "assignments:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CreateSkillBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = normalizeSkillName(body.name ?? "");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let existingSkills: SkillItem[];
  try {
    existingSkills = await loadTenantSkills(user.tenantId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to validate skills" },
      { status: 500 }
    );
  }
  const duplicate = existingSkills.some(
    (skill) => skill.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    return NextResponse.json(
      { error: "A skill with this name already exists" },
      { status: 409 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("skills")
    .insert({
      tenant_id: user.tenantId,
      name,
    })
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);

  return NextResponse.json({
    skill: {
      id: data.id,
      name: data.name ?? "",
    } satisfies SkillItem,
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user.role, "assignments:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: UpdateSkillBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const skillId = (body.id ?? "").trim();
  const name = normalizeSkillName(body.name ?? "");
  if (!skillId || !name) {
    return NextResponse.json(
      { error: "id and name are required" },
      { status: 400 }
    );
  }

  let existingSkills: SkillItem[];
  try {
    existingSkills = await loadTenantSkills(user.tenantId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to validate skills" },
      { status: 500 }
    );
  }
  const duplicate = existingSkills.some(
    (skill) =>
      skill.id !== skillId &&
      skill.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    return NextResponse.json(
      { error: "A skill with this name already exists" },
      { status: 409 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("skills")
    .update({ name })
    .eq("id", skillId)
    .eq("tenant_id", user.tenantId)
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);

  return NextResponse.json({
    skill: {
      id: data.id,
      name: data.name ?? "",
    } satisfies SkillItem,
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user.role, "assignments:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: DeleteSkillBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const skillId = (body.id ?? "").trim();
  if (!skillId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: skillRow, error: skillError } = await admin
    .from("skills")
    .select("id, name")
    .eq("id", skillId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (skillError || !skillRow) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const { data: staffLinks, error: staffLinkError } = await admin
    .from("staff_skills")
    .select("staff_id")
    .eq("tenant_id", user.tenantId)
    .eq("skill_id", skillId);

  if (staffLinkError) {
    return NextResponse.json({ error: staffLinkError.message }, { status: 500 });
  }

  const { data: projectLinks, error: projectLinkError } = await admin
    .from("project_skill_requirements")
    .select("project_id")
    .eq("tenant_id", user.tenantId)
    .eq("skill_id", skillId);

  if (projectLinkError) {
    return NextResponse.json({ error: projectLinkError.message }, { status: 500 });
  }

  // Explicitly remove references so deletion behavior is deterministic even if FK
  // constraints are changed later.
  const { error: deleteStaffSkillsError } = await admin
    .from("staff_skills")
    .delete()
    .eq("tenant_id", user.tenantId)
    .eq("skill_id", skillId);

  if (deleteStaffSkillsError) {
    return NextResponse.json(
      { error: deleteStaffSkillsError.message },
      { status: 500 }
    );
  }

  const { error: deleteProjectRequirementsError } = await admin
    .from("project_skill_requirements")
    .delete()
    .eq("tenant_id", user.tenantId)
    .eq("skill_id", skillId);

  if (deleteProjectRequirementsError) {
    return NextResponse.json(
      { error: deleteProjectRequirementsError.message },
      { status: 500 }
    );
  }

  // Legacy compatibility: if staff_profiles.skills JSONB exists and is populated,
  // remove this skill by id or name from arrays.
  const { data: profilesWithSkills, error: profileReadError } = await admin
    .from("staff_profiles")
    .select("id, skills")
    .eq("tenant_id", user.tenantId)
    .not("skills", "is", null);

  if (!profileReadError && profilesWithSkills) {
    for (const profile of profilesWithSkills) {
      const raw = profile.skills;
      if (!Array.isArray(raw)) continue;
      const next = raw.filter((entry) => {
        if (typeof entry === "string") {
          return entry.trim().toLowerCase() !== skillRow.name.trim().toLowerCase();
        }
        if (entry && typeof entry === "object") {
          const obj = entry as { id?: unknown; name?: unknown };
          const matchesId =
            typeof obj.id === "string" && obj.id.trim() === skillId;
          const matchesName =
            typeof obj.name === "string" &&
            obj.name.trim().toLowerCase() === skillRow.name.trim().toLowerCase();
          return !matchesId && !matchesName;
        }
        return true;
      });
      if (next.length === raw.length) continue;
      const { error: profileUpdateError } = await admin
        .from("staff_profiles")
        .update({ skills: next })
        .eq("tenant_id", user.tenantId)
        .eq("id", profile.id);
      if (profileUpdateError) {
        return NextResponse.json(
          { error: profileUpdateError.message },
          { status: 500 }
        );
      }
    }
  }

  // Optional compatibility cleanup for environments that store proposal skills
  // in project_proposals.skills JSONB.
  const { data: proposalsWithSkills, error: proposalReadError } = await admin
    .from("project_proposals")
    .select("id, skills")
    .eq("tenant_id", user.tenantId)
    .not("skills", "is", null);

  if (!proposalReadError && proposalsWithSkills) {
    for (const proposal of proposalsWithSkills) {
      const raw = proposal.skills;
      if (!Array.isArray(raw)) continue;
      const next = raw.filter((entry) => {
        if (typeof entry === "string") {
          return entry.trim().toLowerCase() !== skillRow.name.trim().toLowerCase();
        }
        if (entry && typeof entry === "object") {
          const obj = entry as { id?: unknown; name?: unknown };
          const matchesId =
            typeof obj.id === "string" && obj.id.trim() === skillId;
          const matchesName =
            typeof obj.name === "string" &&
            obj.name.trim().toLowerCase() === skillRow.name.trim().toLowerCase();
          return !matchesId && !matchesName;
        }
        return true;
      });
      if (next.length === raw.length) continue;
      const { error: proposalUpdateError } = await admin
        .from("project_proposals")
        .update({ skills: next })
        .eq("tenant_id", user.tenantId)
        .eq("id", proposal.id);
      if (proposalUpdateError) {
        return NextResponse.json(
          { error: proposalUpdateError.message },
          { status: 500 }
        );
      }
    }
  }

  const { error } = await admin
    .from("skills")
    .delete()
    .eq("id", skillId)
    .eq("tenant_id", user.tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);

  return NextResponse.json({
    success: true,
    removed_from_staff_count: (staffLinks ?? []).length,
    removed_from_project_count: (projectLinks ?? []).length,
  });
}
