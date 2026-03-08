import { NextResponse } from "next/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export type SkillItem = {
  id: string;
  name: string;
};

export type SkillsListResponse = {
  skills: SkillItem[];
};

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("skills")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const skills: SkillItem[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? "",
  }));

  return NextResponse.json({ skills } satisfies SkillsListResponse);
}
