/**
 * Supabase/PostgREST may return relations as single object or array.
 * These helpers safely extract values from relation responses.
 */

export function getRelationOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export function getStaffEmail(sp: { users?: { email: string } | { email: string }[] | null }): string {
  const u = getRelationOne(sp.users);
  return u?.email ?? "Unknown";
}
