import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";

type RouteItem = {
  path: string;
  note?: string;
  isTemplate?: boolean;
};

type RouteSection = {
  title: string;
  routes: RouteItem[];
};

type SampleIds = {
  projectId: string | null;
  proposalId: string | null;
  staffId: string | null;
};

const sections: RouteSection[] = [
  {
    title: "General",
    routes: [
      { path: "/" },
      { path: "/settings" },
      { path: "/superadmin", note: "Requires secret key in header or query." },
    ],
  },
  {
    title: "Authentication",
    routes: [
      { path: "/login" },
      { path: "/signup" },
      { path: "/invite/[token]", isTemplate: true, note: "Dynamic token route." },
    ],
  },
  {
    title: "Dashboard and Planning",
    routes: [
      { path: "/dashboard" },
      { path: "/alerts" },
      { path: "/forecast" },
      { path: "/capacity-planner" },
      { path: "/time-entry" },
      { path: "/leave" },
    ],
  },
  {
    title: "Projects",
    routes: [
      { path: "/projects" },
      { path: "/projects/new" },
      { path: "/projects/[id]", isTemplate: true },
      { path: "/projects/[id]/edit", isTemplate: true },
      { path: "/projects/[id]/assignments", isTemplate: true },
    ],
  },
  {
    title: "Proposals",
    routes: [
      { path: "/proposals" },
      { path: "/proposals/new" },
      { path: "/proposals/[id]", isTemplate: true },
      { path: "/proposals/[id]/edit", isTemplate: true },
    ],
  },
  {
    title: "Staff and Admin",
    routes: [
      { path: "/staff" },
      { path: "/staff/[id]", isTemplate: true },
      { path: "/admin", note: "Administrator role required." },
      { path: "/admin/users", note: "Administrator role required." },
      { path: "/admin/offices", note: "Administrator role required." },
      { path: "/admin/settings", note: "Administrator role required." },
    ],
  },
];

function getSamplePath(templatePath: string, sampleIds: SampleIds): string | null {
  if (templatePath === "/projects/[id]") return sampleIds.projectId ? `/projects/${sampleIds.projectId}` : null;
  if (templatePath === "/projects/[id]/edit") return sampleIds.projectId ? `/projects/${sampleIds.projectId}/edit` : null;
  if (templatePath === "/projects/[id]/assignments") return sampleIds.projectId ? `/projects/${sampleIds.projectId}/assignments` : null;
  if (templatePath === "/proposals/[id]") return sampleIds.proposalId ? `/proposals/${sampleIds.proposalId}` : null;
  if (templatePath === "/proposals/[id]/edit") return sampleIds.proposalId ? `/proposals/${sampleIds.proposalId}/edit` : null;
  if (templatePath === "/staff/[id]") return sampleIds.staffId ? `/staff/${sampleIds.staffId}` : null;
  return null;
}

export default async function PageIndex() {
  const user = await getCurrentUserWithTenant();
  const sampleIds: SampleIds = { projectId: null, proposalId: null, staffId: null };

  if (user) {
    const supabase = await createClient();
    const [{ data: project }, { data: proposal }, { data: staff }] = await Promise.all([
      supabase
        .from("projects")
        .select("id")
        .eq("tenant_id", user.tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("project_proposals")
        .select("id")
        .eq("tenant_id", user.tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("staff_profiles")
        .select("id")
        .eq("tenant_id", user.tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    sampleIds.projectId = project?.id ?? null;
    sampleIds.proposalId = proposal?.id ?? null;
    sampleIds.staffId = staff?.id ?? null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-page-title">Page Index</h1>
        <p className="app-page-subtitle">
          Temporary route map for manual review. Role guards still apply when you open each page.
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.title} className="app-card p-4">
          <h2 className="mb-3 text-base font-semibold text-zinc-900">{section.title}</h2>
          <ul className="space-y-2">
            {section.routes.map((route) => (
              <li key={route.path} className="rounded border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {route.isTemplate ? (
                    <>
                      <code className="rounded bg-zinc-100 px-2 py-1 text-sm text-zinc-800">
                        {route.path}
                      </code>
                      {getSamplePath(route.path, sampleIds) ? (
                        <Link
                          href={getSamplePath(route.path, sampleIds) as string}
                          className="app-link text-xs font-medium text-zinc-700"
                        >
                          Open sample
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-500">No sample record found</span>
                      )}
                    </>
                  ) : (
                    <Link href={route.path} className="app-link text-sm font-medium text-zinc-900">
                      {route.path}
                    </Link>
                  )}
                  {route.isTemplate && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      Dynamic template
                    </span>
                  )}
                </div>
                {route.note && <p className="mt-2 text-xs text-zinc-600">{route.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
