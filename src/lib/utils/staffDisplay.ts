type StaffUserLike = {
  name?: string | null;
  email?: string | null;
};

function toUserLike(value: unknown): StaffUserLike | null {
  if (!value || typeof value !== "object") return null;
  return value as StaffUserLike;
}

function getPrimaryUser(usersRaw: unknown): StaffUserLike | null {
  if (Array.isArray(usersRaw)) {
    return toUserLike(usersRaw[0]);
  }
  return toUserLike(usersRaw);
}

export function getStaffDisplayName(
  profileName: string | null | undefined,
  usersRaw: unknown
): string {
  const user = getPrimaryUser(usersRaw);
  return (
    profileName?.trim() ||
    user?.name?.trim() ||
    user?.email?.trim() ||
    "Unknown staff"
  );
}
