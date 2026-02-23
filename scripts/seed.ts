/**
 * Seed script for Capacity Intelligence Platform
 * Run with: npx tsx scripts/seed.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Creates: 1 tenant, 3 offices, 20 staff (auth users + app data), 5 projects,
 *          project assignments, time entries, leave requests.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const TENANT_ID = "a0000000-0000-0000-0000-000000000001";
const OFFICE_IDS = [
  "b0000000-0000-0000-0000-000000000001",
  "b0000000-0000-0000-0000-000000000002",
  "b0000000-0000-0000-0000-000000000003",
];
const PROJECT_IDS = [
  "c0000000-0000-0000-0000-000000000001",
  "c0000000-0000-0000-0000-000000000002",
  "c0000000-0000-0000-0000-000000000003",
  "c0000000-0000-0000-0000-000000000004",
  "c0000000-0000-0000-0000-000000000005",
];

const STAFF = [
  { email: "ceo@acme.com", role: "administrator" as const, office: 0, title: "CEO", capacity: 40 },
  { email: "director@acme.com", role: "manager" as const, office: 0, title: "Director", capacity: 40 },
  { email: "pm1@acme.com", role: "manager" as const, office: 0, title: "Project Manager", capacity: 40 },
  { email: "engineer1@acme.com", role: "staff" as const, office: 0, title: "Senior Engineer", capacity: 40 },
  { email: "engineer2@acme.com", role: "staff" as const, office: 0, title: "Engineer", capacity: 40 },
  { email: "engineer3@acme.com", role: "staff" as const, office: 0, title: "Engineer", capacity: 40 },
  { email: "engineer4@acme.com", role: "staff" as const, office: 1, title: "Engineer", capacity: 40 },
  { email: "engineer5@acme.com", role: "staff" as const, office: 1, title: "Engineer", capacity: 40 },
  { email: "engineer6@acme.com", role: "staff" as const, office: 1, title: "Graduate Engineer", capacity: 40 },
  { email: "engineer7@acme.com", role: "staff" as const, office: 2, title: "Engineer", capacity: 37.5 },
  { email: "engineer8@acme.com", role: "staff" as const, office: 2, title: "Engineer", capacity: 37.5 },
  { email: "parttime@acme.com", role: "staff" as const, office: 0, title: "Consultant", capacity: 20 },
  ...Array.from({ length: 8 }, (_, i) => ({
    email: `staff${i + 9}@acme.com`,
    role: "staff" as const,
    office: i % 3,
    title: "Engineer",
    capacity: 40,
  })),
];

async function main() {
  console.log("Seeding...");

  // 1. Tenant
  await supabase.from("tenants").upsert({
    id: TENANT_ID,
    name: "Acme Engineering Consultants",
    industry: "Engineering",
    default_currency: "USD",
  }, { onConflict: "id" });

  // 2. Offices
  await supabase.from("offices").upsert([
    { id: OFFICE_IDS[0], tenant_id: TENANT_ID, name: "London HQ", country: "UK", timezone: "Europe/London", weekly_working_hours: 40 },
    { id: OFFICE_IDS[1], tenant_id: TENANT_ID, name: "Singapore Office", country: "Singapore", timezone: "Asia/Singapore", weekly_working_hours: 40 },
    { id: OFFICE_IDS[2], tenant_id: TENANT_ID, name: "Sydney Office", country: "Australia", timezone: "Australia/Sydney", weekly_working_hours: 37.5 },
  ], { onConflict: "id" });

  // 3. Projects
  await supabase.from("projects").upsert([
    { id: PROJECT_IDS[0], tenant_id: TENANT_ID, name: "Bridge Design Phase 1", client_name: "City Council", estimated_hours: 400, start_date: "2025-01-01", end_date: "2025-06-30", status: "active" },
    { id: PROJECT_IDS[1], tenant_id: TENANT_ID, name: "HVAC Retrofit Study", client_name: "Property Corp", estimated_hours: 120, start_date: "2025-02-01", end_date: "2025-04-30", status: "active" },
    { id: PROJECT_IDS[2], tenant_id: TENANT_ID, name: "Structural Assessment", client_name: "Insurance Co", estimated_hours: 80, start_date: "2025-01-15", end_date: "2025-03-15", status: "active" },
    { id: PROJECT_IDS[3], tenant_id: TENANT_ID, name: "MEP Design Package", client_name: "Developer Ltd", estimated_hours: 600, start_date: "2024-11-01", end_date: "2025-08-31", status: "active" },
    { id: PROJECT_IDS[4], tenant_id: TENANT_ID, name: "Feasibility Study", client_name: "New Client Inc", estimated_hours: 50, start_date: "2025-02-10", end_date: "2025-03-10", status: "active" },
  ], { onConflict: "id" });

  // 4. Create auth users + app users (trigger creates staff_profiles)
  const staffProfileIds: string[] = [];
  for (const s of STAFF) {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: s.email,
      password: "Password123!",
      email_confirm: true,
      user_metadata: {
        tenant_id: TENANT_ID,
        role: s.role,
        office_id: OFFICE_IDS[s.office],
      },
    });

    if (authError) {
      const { data: existing } = await supabase.from("users").select("id").eq("email", s.email).single();
      if (existing) {
        const { data: sp } = await supabase.from("staff_profiles").select("id").eq("user_id", existing.id).single();
        if (sp) staffProfileIds.push(sp.id);
      }
      continue;
    }

    if (authUser?.user) {
      await supabase.from("staff_profiles").update({
        job_title: s.title,
        weekly_capacity_hours: s.capacity,
      }).eq("user_id", authUser.user.id);

      const { data: sp } = await supabase.from("staff_profiles").select("id").eq("user_id", authUser.user.id).single();
      if (sp) staffProfileIds.push(sp.id);
    }
  }

  // 5. Project assignments (need staff profile ids)
  const { data: allStaff } = await supabase.from("staff_profiles").select("id").eq("tenant_id", TENANT_ID);
  const spIds = allStaff?.map((s) => s.id) ?? [];

  if (spIds.length > 0) {
    const assignments: { project_id: string; staff_id: string; allocation_percentage: number }[] = [];
    spIds.slice(0, 12).forEach((staffId, i) => {
      assignments.push({ project_id: PROJECT_IDS[i % 5], staff_id: staffId, allocation_percentage: 50 });
      if (i < 5) assignments.push({ project_id: PROJECT_IDS[(i + 1) % 5], staff_id: staffId, allocation_percentage: 50 });
    });
    await supabase.from("project_assignments").upsert(assignments, { onConflict: "project_id,staff_id" });
  }

  // 6. Time entries (last 4 weeks)
  if (spIds.length > 0) {
    const entries: { tenant_id: string; staff_id: string; project_id: string; date: string; hours: number; billable_flag: boolean }[] = [];
    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 5; d++) {
        const date = new Date();
        date.setDate(date.getDate() - (w * 7 + d));
        const dateStr = date.toISOString().split("T")[0];
        spIds.slice(0, 15).forEach((staffId, i) => {
          const hours = 6 + Math.random() * 4;
          entries.push({
            tenant_id: TENANT_ID,
            staff_id: staffId,
            project_id: PROJECT_IDS[i % 5],
            date: dateStr,
            hours: Math.round(hours * 4) / 4,
            billable_flag: Math.random() > 0.2,
          });
        });
      }
    }
    await supabase.from("time_entries").insert(entries);
  }

  // 7. Leave requests
  if (spIds.length > 2) {
    await supabase.from("leave_requests").insert([
      { tenant_id: TENANT_ID, staff_id: spIds[3], start_date: "2025-03-01", end_date: "2025-03-05", leave_type: "Annual", status: "approved" },
      { tenant_id: TENANT_ID, staff_id: spIds[5], start_date: "2025-03-10", end_date: "2025-03-12", leave_type: "Sick", status: "approved" },
      { tenant_id: TENANT_ID, staff_id: spIds[7], start_date: "2025-04-01", end_date: "2025-04-14", leave_type: "Annual", status: "approved" },
    ]);
  }

  console.log("Seed complete. Login with engineer1@acme.com / Password123!");
}

main().catch(console.error);
