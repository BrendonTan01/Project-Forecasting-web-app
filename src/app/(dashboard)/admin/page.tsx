import { createClient } from "@/lib/supabase/server";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;

  const supabase = await createClient();

  const [
    { count: userCount },
    { count: projectCount },
    { count: pendingLeaveCount },
    { count: pendingInviteCount },
    { data: tenant },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId),
    supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId)
      .eq("status", "active"),
    supabase
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId)
      .eq("status", "pending"),
    supabase
      .from("invitations")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
    supabase
      .from("tenants")
      .select("id, name, industry, default_currency")
      .eq("id", user.tenantId)
      .single(),
  ]);

  const stats = [
    { label: "Total users", value: userCount ?? 0, href: "/admin/users" },
    { label: "Active projects", value: projectCount ?? 0, href: "/projects" },
    { label: "Pending leave requests", value: pendingLeaveCount ?? 0, href: "/leave" },
    { label: "Pending invitations", value: pendingInviteCount ?? 0, href: "/admin/users" },
  ];

  return (
    <div className="space-y-6">
      {/* Org info */}
      <div className="app-card p-4">
        <h2 className="mb-3 font-semibold text-zinc-900">Organisation</h2>
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-zinc-500">Name</dt>
            <dd className="font-semibold text-zinc-900">{tenant?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500">Industry</dt>
            <dd className="text-zinc-800">{tenant?.industry ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500">Default currency</dt>
            <dd className="text-zinc-800">{tenant?.default_currency ?? "USD"}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <Link href="/admin/settings" className="app-link text-sm">
            Edit org settings →
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="app-card block p-4 transition-colors hover:border-zinc-300">
            <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900">{stat.value}</p>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="app-card p-4">
        <h2 className="mb-3 font-semibold text-zinc-900">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/users" className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm">
            Manage users
          </Link>
          <Link href="/admin/offices" className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm">
            Manage offices
          </Link>
          <Link href="/leave" className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm">
            Review leave requests
          </Link>
          <Link href="/admin/settings" className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm">
            Org settings
          </Link>
        </div>
      </div>
    </div>
  );
}
