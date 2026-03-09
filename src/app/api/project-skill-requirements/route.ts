import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scheduleForecastRecalculation,
  scheduleHiringPredictionsRecalculation,
} from "@/lib/forecast/engine";

type RequirementInput = {
  skill_id: string;
  required_hours_per_week: number;
};

type PutBody = {
  project_id: string;
  requirements: RequirementInput[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("project_id")?.trim() ?? "";
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("project_skill_requirements")
    .select("skill_id, required_hours_per_week, skills(id, name)")
    .eq("tenant_id", user.tenantId)
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requirements = (data ?? [])
    .map((row) => {
      const relation = row.skills;
      const skill = Array.isArray(relation) ? relation[0] : relation;
      return {
        skill_id: row.skill_id,
        skill_name: skill?.name ?? "Unknown",
        required_hours_per_week: Number(row.required_hours_per_week ?? 0),
      };
    })
    .sort((a, b) => a.skill_name.localeCompare(b.skill_name));

  return NextResponse.json({
    project_id: projectId,
    requirements,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user.role, "projects:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = (body.project_id ?? "").trim();
  const requirements = (body.requirements ?? []).map((item) => ({
    skill_id: (item.skill_id ?? "").trim(),
    required_hours_per_week: Number(item.required_hours_per_week ?? 0),
  }));

  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  if (
    requirements.some(
      (item) => !item.skill_id || !Number.isFinite(item.required_hours_per_week) || item.required_hours_per_week < 0
    )
  ) {
    return NextResponse.json(
      { error: "Each requirement needs a valid skill_id and non-negative required_hours_per_week" },
      { status: 400 }
    );
  }

  const uniqueSkillIds = Array.from(new Set(requirements.map((item) => item.skill_id)));
  if (uniqueSkillIds.length !== requirements.length) {
    return NextResponse.json(
      { error: "Each skill can only appear once in requirements" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (uniqueSkillIds.length > 0) {
    const { data: tenantSkills, error: skillsError } = await admin
      .from("skills")
      .select("id")
      .eq("tenant_id", user.tenantId)
      .in("id", uniqueSkillIds);

    if (skillsError) {
      return NextResponse.json({ error: skillsError.message }, { status: 500 });
    }

    if ((tenantSkills ?? []).length !== uniqueSkillIds.length) {
      return NextResponse.json(
        { error: "One or more skill_ids are invalid for this tenant" },
        { status: 400 }
      );
    }
  }

  const { error: deleteError } = await admin
    .from("project_skill_requirements")
    .delete()
    .eq("tenant_id", user.tenantId)
    .eq("project_id", projectId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (requirements.length > 0) {
    const { error: insertError } = await admin
      .from("project_skill_requirements")
      .insert(
        requirements.map((item) => ({
          tenant_id: user.tenantId,
          project_id: projectId,
          skill_id: item.skill_id,
          required_hours_per_week: item.required_hours_per_week,
        }))
      );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);

  return NextResponse.json({
    project_id: projectId,
    requirements,
    success: true,
  });
}
