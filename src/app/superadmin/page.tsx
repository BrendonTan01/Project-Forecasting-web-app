import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Platform superadmin page — shows all tenants, user counts, and subscription status.
 *
 * Authentication: checked against the SUPERADMIN_SECRET env variable.
 * Pass the secret in the X-Superadmin-Secret request header, or as a ?secret= query param.
 *
 * This page is intentionally NOT protected by Supabase Auth — it is a separate layer
 * for platform operators, not tenant users.
 */

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function planBadge(plan: string, status: string): string {
  if (status === "canceled") return "text-zinc-400";
  if (plan === "enterprise") return "text-purple-700 font-semibold";
  if (plan === "growth") return "text-blue-700 font-semibold";
  return "text-zinc-600";
}

export default async function SuperadminPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const secret = process.env.SUPERADMIN_SECRET;
  const headersList = await headers();
  const { secret: querySecret } = await searchParams;

  const providedSecret =
    headersList.get("x-superadmin-secret") ?? querySecret ?? "";

  if (!secret || providedSecret !== secret) {
    notFound();
  }

  const admin = createAdminClient();

  // Fetch all tenants with user counts, subscriptions, and recent activity
  const [{ data: tenants }, { data: subscriptions }, { data: userCounts }] =
    await Promise.all([
      admin
        .from("tenants")
        .select("id, name, industry, default_currency, created_at")
        .order("created_at", { ascending: false }),
      admin
        .from("subscriptions")
        .select("tenant_id, plan, status, current_period_end, stripe_customer_id"),
      admin.from("users").select("tenant_id"),
    ]);

  const subByTenant = Object.fromEntries(
    (subscriptions ?? []).map((s) => [s.tenant_id, s])
  );

  const userCountByTenant = (userCounts ?? []).reduce<Record<string, number>>(
    (acc, u) => {
      acc[u.tenant_id] = (acc[u.tenant_id] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const totalTenants = tenants?.length ?? 0;
  const totalUsers = userCounts?.length ?? 0;
  const paidTenants = (subscriptions ?? []).filter(
    (s) => s.plan !== "free" && s.status === "active"
  ).length;

  return (
    <div className="min-h-screen p-8" style={{ backgroundColor: "var(--background)" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">Platform Superadmin</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Internal dashboard — do not share this URL.
          </p>
        </div>

        {/* Platform stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm font-medium text-zinc-500">Total tenants</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">{totalTenants}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm font-medium text-zinc-500">Total users</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">{totalUsers}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm font-medium text-zinc-500">Paying tenants</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">{paidTenants}</p>
          </div>
        </div>

        {/* Tenants table */}
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="px-6 py-4 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-900">All tenants</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  <th className="px-4 py-3">Organisation</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3 text-right">Users</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Sub status</th>
                  <th className="px-4 py-3">Period end</th>
                  <th className="px-4 py-3">Stripe customer</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {(tenants ?? []).map((tenant) => {
                  const sub = subByTenant[tenant.id];
                  const users = userCountByTenant[tenant.id] ?? 0;

                  return (
                    <tr
                      key={tenant.id}
                      className="border-b border-zinc-100 hover:bg-zinc-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900">{tenant.name}</p>
                        <p className="text-xs font-mono text-zinc-400">{tenant.id}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {tenant.industry ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-zinc-800">
                        {users}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${planBadge(sub?.plan ?? "free", sub?.status ?? "active")}`}>
                          {sub?.plan ?? "free"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {sub?.status ?? "active"}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {formatDate(sub?.current_period_end ?? null)}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-zinc-400">
                        {sub?.stripe_customer_id ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {formatDate(tenant.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
