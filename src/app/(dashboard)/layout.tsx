import { redirect } from "next/navigation";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { hasPermission } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";
import DashboardShellNav from "@/components/ui/DashboardShellNav";

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
  const navLinks = navItems
    .filter((item) => item.canAccess(user.role))
    .map((item) => ({
      href: item.href,
      label: item.label,
      group: item.group,
    }));
  const navGroups = [
    { key: "overview", label: "Overview" },
    { key: "planning", label: "Plan & Bid" },
    { key: "delivery", label: "Delivery" },
    { key: "operations", label: "Ops" },
  ] as const;
  const workflowSections: Array<{
    key: "overview" | "planning" | "delivery" | "operations";
    label: string;
    href: string;
  }> = [];
  for (const group of navGroups) {
    const firstLink = navLinks.find((link) => link.group === group.key);
    if (!firstLink) continue;
    workflowSections.push({
      key: group.key,
      label: group.label,
      href: firstLink.href,
    });
  }

  return (
    <div className="app-shell">
      <DashboardShellNav
        sections={workflowSections}
        links={navLinks}
        userEmail={user.email}
        canCreateProject={hasPermission(user.role, "projects:manage")}
      />
      <main className="min-h-screen md:ml-64">
        <div className="mx-auto max-w-[1440px] px-4 pb-12 pt-28 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
