export function parseOfficeScope(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function isOfficeInScope(rawScope: unknown, officeId: string | null): boolean {
  if (!officeId) return false;
  const scope = parseOfficeScope(rawScope);
  if (scope.length === 0) return true;
  return scope.includes(officeId);
}

export function enforceManagerOfficeIds(
  requestedOfficeIds: string[] | null | undefined,
  managerOfficeId: string | null
): string[] | null {
  if (!managerOfficeId) return null;
  if (!requestedOfficeIds || requestedOfficeIds.length === 0) return [managerOfficeId];
  if (requestedOfficeIds.includes(managerOfficeId)) return [managerOfficeId];
  return [managerOfficeId];
}
