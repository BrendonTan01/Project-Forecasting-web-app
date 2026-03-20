"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type WorkflowGroupKey = "overview" | "planning" | "delivery" | "operations";

type WorkflowLink = {
  href: string;
  label: string;
  group: WorkflowGroupKey;
};

type WorkflowSection = {
  key: WorkflowGroupKey;
  label: string;
  href: string;
};

function normalize(path: string) {
  return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
}

function isPathActive(pathname: string, href: string) {
  const normalizedPathname = normalize(pathname);
  const normalizedHref = normalize(href);
  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}

export default function WorkflowNavigation({
  sections,
  links,
}: {
  sections: WorkflowSection[];
  links: WorkflowLink[];
}) {
  const pathname = normalize(usePathname() ?? "/");

  const activeSection =
    sections.find((section) => isPathActive(pathname, section.href)) ??
    sections.find((section) => links.some((link) => link.group === section.key && isPathActive(pathname, link.href))) ??
    sections[0];

  if (!activeSection) return null;

  const sectionLinks = links.filter((link) => link.group === activeSection.key);

  return (
    <div className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
      <aside className="app-panel h-fit p-2">
        <div className="space-y-1">
          {sections.map((section) => {
            const isActive = section.key === activeSection.key;
            return (
              <Link
                key={section.key}
                href={section.href}
                className={`focus-ring block rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-[color:var(--surface-lowest)] text-zinc-900 shadow-sm"
                    : "text-[color:var(--muted-text)] hover:bg-[color:var(--surface-muted)]"
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="space-y-3">
        <div className="app-toolbar flex flex-wrap items-center gap-2 p-2">
          {sectionLinks.map((link) => {
            const isActive = isPathActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`app-nav-link focus-ring ${isActive ? "app-nav-link-active" : ""}`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        <p className="px-1 text-xs text-[color:var(--muted-text)]">
          Navigate by workflow, then choose a page in that section.
        </p>
      </div>
    </div>
  );
}
