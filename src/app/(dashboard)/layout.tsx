import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { NavLink } from "@/components/ui/NavLink";
import { hasPermission } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
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
    { href: "/page-index", label: "Page Index", canAccess: () => true },
    { href: "/dashboard", label: "Dashboard", canAccess: () => true },
    {
      href: "/projects",
      label: "Projects",
      canAccess: (role) => hasPermission(role, "projects:manage"),
    },
    {
      href: "/proposals",
      label: "Proposals",
      canAccess: (role) => hasPermission(role, "proposals:manage"),
    },
    { href: "/staff", label: "Staff", canAccess: () => true },
    {
      href: "/capacity-planner",
      label: "Capacity Planner",
      canAccess: (role) => hasPermission(role, "assignments:manage"),
    },
    {
      href: "/forecast",
      label: "Forecast",
      canAccess: (role) => hasPermission(role, "financials:view"),
    },
    {
      href: "/hiring-insights",
      label: "Hiring Insights",
      canAccess: (role) => hasPermission(role, "financials:view"),
    },
    {
      href: "/time-entry",
      label: "Time Entry",
      canAccess: (role) => hasPermission(role, "time_entries:create"),
    },
    { href: "/leave", label: "Leave", canAccess: () => true },
    { href: "/alerts", label: "Alerts", canAccess: () => true },
    {
      href: "/admin",
      label: "Admin",
      canAccess: (role) => hasPermission(role, "admin:access"),
    },
  ];
  const navLinks = navItems.filter((item) => item.canAccess(user.role));

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <nav className="flex flex-wrap items-center gap-1">
            {navLinks.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} />
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-zinc-600">
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
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
