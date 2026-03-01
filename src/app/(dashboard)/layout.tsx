import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { NavLink } from "@/components/ui/NavLink";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserWithTenant();

  if (!user) {
    redirect("/login");
  }

  const isStaff = user.role === "staff";
  const navLinks = isStaff
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/staff", label: "Staff" },
        { href: "/time-entry", label: "Time Entry" },
        { href: "/alerts", label: "Alerts" },
      ]
    : [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/projects", label: "Projects" },
        { href: "/proposals", label: "Proposals" },
        { href: "/staff", label: "Staff" },
        { href: "/capacity", label: "Capacity" },
        { href: "/time-entry", label: "Time Entry" },
        { href: "/alerts", label: "Alerts" },
      ];

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
