"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function normalize(path: string) {
  return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
}

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = normalize(usePathname() ?? "/");
  const normalizedHref = normalize(href);
  const isActive = pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`app-nav-link focus-ring ${isActive ? "app-nav-link-active" : ""}`}
    >
      {label}
    </Link>
  );
}
