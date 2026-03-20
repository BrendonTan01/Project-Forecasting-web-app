"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type GroupKey = "overview" | "planning" | "delivery" | "operations";

type SectionLink = {
  key: GroupKey;
  label: string;
  href: string;
};

type PageLink = {
  href: string;
  label: string;
  group: GroupKey;
};

function normalize(path: string) {
  return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
}

function isActive(pathname: string, href: string) {
  const a = normalize(pathname);
  const b = normalize(href);
  return a === b || a.startsWith(`${b}/`);
}

export default function DashboardShellNav({
  sections,
  links,
  userEmail,
  canCreateProject,
}: {
  sections: SectionLink[];
  links: PageLink[];
  userEmail: string;
  canCreateProject: boolean;
}) {
  const pathname = normalize(usePathname() ?? "/");
  const activeSection =
    sections.find((section) => isActive(pathname, section.href)) ??
    sections.find((section) =>
      links.some((link) => link.group === section.key && isActive(pathname, link.href))
    ) ??
    sections[0];
  const activePages = activeSection
    ? links.filter((link) => link.group === activeSection.key)
    : [];

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-slate-200/15 bg-slate-50 p-4 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[color:var(--accent)] text-white">
            <span className="text-xs font-semibold">CI</span>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-slate-900">Capacity Platform</h1>
            <p className="text-[0.7rem] font-bold uppercase tracking-wider text-[color:var(--muted-text)]">Strategic Ops</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {sections.map((section) => {
            const sectionActive = activeSection?.key === section.key;
            return (
              <Link
                key={section.key}
                href={section.href}
                className={`focus-ring flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  sectionActive
                    ? "scale-[0.98] bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-900"
                }`}
              >
                <span>{section.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 space-y-1 border-t border-slate-200/30 pt-4">
          {canCreateProject && (
            <Link
              href="/projects/new"
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--accent)] py-2.5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-[#131b2e]"
            >
              New Project
            </Link>
          )}
          <Link
            href="/settings"
            className="focus-ring flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-all hover:bg-slate-200/50 hover:text-slate-900"
          >
            Help Center
          </Link>
          <Link
            href="/settings"
            className="focus-ring flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-all hover:bg-slate-200/50 hover:text-slate-900"
          >
            Account
          </Link>
          <Link
            href="/settings"
            className="focus-ring flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-all hover:bg-slate-200/50 hover:text-slate-900"
          >
            Settings
          </Link>
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-30 h-16 bg-white/80 shadow-sm backdrop-blur-md md:left-64">
        <div className="mx-auto flex h-full max-w-[1920px] items-center justify-between px-8">
          <span className="text-xl font-semibold tracking-tighter text-slate-900">Strategic Intelligence</span>
          <div className="flex items-center gap-4">
            <span className="hidden max-w-[22rem] truncate rounded-full border border-[color:color-mix(in_srgb,var(--border)_28%,transparent)] bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 lg:block">
              {userEmail}
            </span>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="focus-ring rounded-full px-4 py-1.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-100/50"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="fixed left-0 right-0 top-16 z-20 border-b border-[color:color-mix(in_srgb,var(--border)_24%,transparent)] bg-white/85 backdrop-blur-sm md:left-64">
        <div className="mx-auto flex max-w-[1920px] items-center gap-2 overflow-x-auto px-8 py-2">
          {activePages.map((link) => {
            const pageActive = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`focus-ring whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  pageActive
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[color:var(--muted-text)] hover:bg-[color:var(--surface-muted)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
