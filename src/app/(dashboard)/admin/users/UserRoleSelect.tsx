"use client";

import { useState } from "react";
import { changeUserRole } from "./actions";
import { Select } from "@/components/ui/primitives";

export default function UserRoleSelect({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: string;
}) {
  const [role, setRole] = useState(currentRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(newRole: string) {
    setLoading(true);
    setError(null);
    setRole(newRole);
    const result = await changeUserRole(userId, newRole as "staff" | "manager" | "administrator");
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setRole(currentRole);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <Select
        value={role}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="py-1 text-sm"
      >
        <option value="staff">Staff</option>
        <option value="manager">Manager</option>
        <option value="administrator">Administrator</option>
      </Select>
      {loading && <span className="text-xs text-zinc-500">Saving...</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
