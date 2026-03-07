"use client";

import { useState } from "react";
import { sendInvitation } from "@/app/(auth)/invite/[token]/actions";
import { Button, Input, Select } from "@/components/ui/primitives";

export default function InviteUserForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "manager" | "administrator">("staff");
  const [result, setResult] = useState<{ inviteUrl?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setLoading(true);

    const res = await sendInvitation({ email, role });
    setLoading(false);
    setResult(res);

    if (!res.error) {
      setEmail("");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label htmlFor="inviteEmail" className="mb-1 block text-sm font-medium text-zinc-700">
            Email address
          </label>
          <Input
            id="inviteEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="colleague@example.com"
          />
        </div>
        <div className="w-44">
          <label htmlFor="inviteRole" className="mb-1 block text-sm font-medium text-zinc-700">
            Role
          </label>
          <Select
            id="inviteRole"
            value={role}
            onChange={(e) => setRole(e.target.value as "staff" | "manager" | "administrator")}
          >
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="administrator">Administrator</option>
          </Select>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send invitation"}
        </Button>
      </form>

      {result?.error && (
        <p className="app-alert app-alert-error">{result.error}</p>
      )}
      {result?.inviteUrl && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-1 text-sm font-medium text-emerald-800">Invitation created.</p>
          <p className="text-xs text-emerald-700">Share this link with the invitee:</p>
          <p className="mt-1 break-all rounded bg-emerald-100 px-2 py-1 font-mono text-xs text-emerald-900">
            {result.inviteUrl}
          </p>
        </div>
      )}
    </div>
  );
}
