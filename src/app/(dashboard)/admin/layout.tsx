import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NavLink } from "@/components/ui/NavLink";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserWithTenant();
  if (!user || user.role !== "administrator") {
    redirect("/dashboard");
  }

  const adminNav = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/skills", label: "Skills" },
    { href: "/admin/offices", label: "Offices" },
    { href: "/admin/settings", label: "Org settings" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="app-link text-sm text-zinc-600">
          ← Dashboard
        </Link>
        <h1 className="app-page-title mt-2">Admin</h1>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2">
        {adminNav.map((link) => (
          <NavLink key={link.href} href={link.href} label={link.label} />
        ))}
      </nav>
      {children}
    </div>
  );
}
