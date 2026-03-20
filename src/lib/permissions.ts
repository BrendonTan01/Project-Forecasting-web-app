import type { UserRole } from "@/lib/types";

/**
 * All discrete permissions in the system.
 *
 * "projects:manage"     – create / edit / delete projects
 * "proposals:manage"    – create / edit / delete proposals
 * "proposals:simulate"  – run proposal simulation scenarios
 * "assignments:manage"  – assign / remove staff on projects
 * "staff:manage"        – invite, deactivate, change roles
 * "financials:view"     – revenue & utilisation dashboards
 * "admin:access"        – /admin section
 * "time_entries:create" – log own hours
 * "leave:approve"       – approve or reject leave requests
 */
type Permission =
  | "projects:manage"
  | "proposals:manage"
  | "proposals:simulate"
  | "assignments:manage"
  | "staff:manage"
  | "financials:view"
  | "admin:access"
  | "time_entries:create"
  | "leave:approve";

const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  administrator: new Set<Permission>([
    "projects:manage",
    "proposals:manage",
    "proposals:simulate",
    "assignments:manage",
    "staff:manage",
    "financials:view",
    "admin:access",
    "time_entries:create",
    "leave:approve",
  ]),
  manager: new Set<Permission>([
    "projects:manage",
    "proposals:simulate",
    "assignments:manage",
    "financials:view",
    "time_entries:create",
    "leave:approve",
  ]),
  staff: new Set<Permission>([
    "time_entries:create",
  ]),
};

/** Returns true if the given role has the requested permission. */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Route prefixes that are blocked for specific roles.
 * Used by both the middleware and layout guards.
 */
const STAFF_BLOCKED_PREFIXES: string[] = ["/proposals", "/capacity", "/capacity-planner"];

/** Returns true when `pathname` is under one of the staff-blocked prefixes. */
export function isStaffBlockedRoute(pathname: string): boolean {
  return STAFF_BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}
