import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scheduleForecastRecalculation,
  scheduleHiringPredictionsRecalculation,
} from "@/lib/forecast/engine";

type PutBody = {
  staff_id: string;
  skill_ids: string[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staffId = request.nextUrl.searchParams.get("staff_id")?.trim() ?? "";
  if (!staffId) {
    return NextResponse.json({ error: "staff_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: staffProfile, error: staffError } = await admin
    .from("staff_profiles")
    .select("id")
    .eq("id", staffId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (staffError || !staffProfile) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("staff_skills")
    .select("skill_id, skills(id, name)")
    .eq("tenant_id", user.tenantId)
    .eq("staff_id", staffId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const skills = (data ?? [])
    .map((row) => {
      const relation = row.skills;
      const skill = Array.isArray(relation) ? relation[0] : relation;
      if (!skill) return null;
      return {
        id: skill.id,
        name: skill.name ?? "",
      };
    })
    .filter((item): item is { id: string; name: string } => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    staff_id: staffId,
    skill_ids: skills.map((skill) => skill.id),
    skills,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user.role, "assignments:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const staffId = (body.staff_id ?? "").trim();
  const skillIds = Array.from(
    new Set((body.skill_ids ?? []).map((id) => id.trim()).filter(Boolean))
  );

  if (!staffId) {
    return NextResponse.json({ error: "staff_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: staffProfile, error: staffError } = await admin
    .from("staff_profiles")
    .select("id")
    .eq("id", staffId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (staffError || !staffProfile) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  if (skillIds.length > 0) {
    const { data: tenantSkills, error: skillsError } = await admin
      .from("skills")
      .select("id")
      .eq("tenant_id", user.tenantId)
      .in("id", skillIds);

    if (skillsError) {
      return NextResponse.json({ error: skillsError.message }, { status: 500 });
    }

    if ((tenantSkills ?? []).length !== skillIds.length) {
      return NextResponse.json(
        { error: "One or more skill_ids are invalid for this tenant" },
        { status: 400 }
      );
    }
  }

  const { error: deleteError } = await admin
    .from("staff_skills")
    .delete()
    .eq("tenant_id", user.tenantId)
    .eq("staff_id", staffId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (skillIds.length > 0) {
    const { error: insertError } = await admin.from("staff_skills").insert(
      skillIds.map((skillId) => ({
        tenant_id: user.tenantId,
        staff_id: staffId,
        skill_id: skillId,
      }))
    );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  scheduleForecastRecalculation(user.tenantId);
  scheduleHiringPredictionsRecalculation(user.tenantId);

  return NextResponse.json({
    staff_id: staffId,
    skill_ids: skillIds,
    success: true,
  });
}
