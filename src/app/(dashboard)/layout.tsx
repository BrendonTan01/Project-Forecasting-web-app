import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { NavLink } from "@/components/ui/NavLink";
import { hasPermission } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  group: "overview" | "planning" | "delivery" | "operations";
  canAccess: (role: UserRole) => boolean;
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    redirect("/login");
  }

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Executive", group: "overview", canAccess: () => true },
    {
      href: "/projects",
      label: "Projects",
      group: "planning",
      canAccess: (role) => hasPermission(role, "projects:manage"),
    },
    {
      href: "/proposals",
      label: "Proposals",
      group: "planning",
      canAccess: (role) => role !== "staff",
    },
    { href: "/staff", label: "Staff", group: "planning", canAccess: () => true },
    {
      href: "/capacity-planner",
      label: "Capacity Planner",
      group: "planning",
      canAccess: (role) => hasPermission(role, "assignments:manage"),
    },
    {
      href: "/forecast",
      label: "Forecast",
      group: "delivery",
      canAccess: (role) => hasPermission(role, "financials:view"),
    },
    {
      href: "/hiring-insights",
      label: "Hiring Insights",
      group: "delivery",
      canAccess: (role) => hasPermission(role, "financials:view"),
    },
    {
      href: "/time-entry",
      label: "Time Entry",
      group: "delivery",
      canAccess: (role) => hasPermission(role, "time_entries:create"),
    },
    { href: "/leave", label: "Leave", group: "operations", canAccess: () => true },
    { href: "/alerts", label: "Alerts", group: "operations", canAccess: () => true },
    {
      href: "/admin",
      label: "Admin",
      group: "operations",
      canAccess: (role) => hasPermission(role, "admin:access"),
    },
  ];
  const navLinks = navItems.filter((item) => item.canAccess(user.role));
  const navGroups = [
    { key: "overview", label: "Overview" },
    { key: "planning", label: "Plan & Bid" },
    { key: "delivery", label: "Delivery" },
    { key: "operations", label: "Ops" },
  ] as const;

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-30 border-b border-[color:color-mix(in_srgb,var(--border)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-lowest)_88%,transparent)] backdrop-blur-xl supports-[backdrop-filter]:bg-[color:color-mix(in_srgb,var(--surface-lowest)_76%,transparent)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
            <div>
              <p className="app-section-caption">Capacity Intelligence Platform</p>
              <h1 className="text-sm font-semibold tracking-tight text-zinc-900">Strategic Intelligence</h1>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <span className="w-full truncate rounded-full border border-[color:color-mix(in_srgb,var(--border)_30%,transparent)] bg-[color:var(--surface-lowest)] px-2.5 py-1 text-xs font-medium text-zinc-600 sm:w-auto sm:max-w-[22rem]">
                {user.email}
              </span>
              <Link href="/settings" className="app-nav-link focus-ring">
                Settings
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="app-nav-link focus-ring"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <nav className="app-toolbar flex items-center gap-2 overflow-x-auto p-2">
            {navGroups.map((group) => {
              const groupedLinks = navLinks.filter((link) => link.group === group.key);
              if (groupedLinks.length === 0) return null;
              return (
                <div key={group.key} className="flex shrink-0 items-center gap-1">
                  <span className="app-nav-group-label whitespace-nowrap">{group.label}</span>
                  {groupedLinks.map((link) => (
                    <NavLink key={link.href} href={link.href} label={link.label} />
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>Navigate by workflow to reduce context switching.</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
