"use client";

import { useState } from "react";
import { upsertProjectAssignment } from "./actions";
import { Button, Select } from "@/components/ui/primitives";

type StaffOption = {
  id: string;
  displayName: string;
  email: string;
  jobTitle: string | null;
  freeHours: number;
  skillMatchPercent: number;
  suitabilityScore: number;
  isSuggested: boolean;
};

export default function AssignmentForm({
  projectId,
  availableStaff,
}: {
  projectId: string;
  availableStaff: StaffOption[];
}) {
  const [staffId, setStaffId] = useState(availableStaff[0]?.id ?? "");
  const [allocation, setAllocation] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (availableStaff.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        All tenant staff are already assigned to this project.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await upsertProjectAssignment(
      projectId,
      staffId,
      parseFloat(allocation)
    );

    setLoading(false);
    if (result.error) {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {availableStaff.some((staff) => staff.isSuggested) && (
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-600">
            Suggested staff (best fit by skills and free time)
          </p>
          <div className="flex flex-wrap gap-2">
            {availableStaff
              .filter((staff) => staff.isSuggested)
              .map((staff) => (
                <button
                  key={staff.id}
                  type="button"
                  onClick={() => setStaffId(staff.id)}
                  className={`focus-ring rounded-full border px-3 py-1 text-xs transition-colors ${
                    staffId === staff.id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 text-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {staff.displayName}
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-40">
        <label htmlFor="staffId" className="mb-1 block text-xs font-medium text-zinc-600">
          Staff member
        </label>
        <Select
          id="staffId"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          required
        >
          {availableStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
              {s.jobTitle ? ` — ${s.jobTitle}` : ""}
              {` — ${s.freeHours.toFixed(1)}h free`}
              {` — ${s.skillMatchPercent}% skill match`}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-32">
        <label htmlFor="allocation" className="mb-1 block text-xs font-medium text-zinc-600">
          Allocation %
        </label>
        <input
          id="allocation"
          type="number"
          min="0"
          max="200"
          step="5"
          value={allocation}
          onChange={(e) => setAllocation(e.target.value)}
          required
          className="app-input w-full"
        />
      </div>
      <Button type="submit" disabled={loading} size="sm">
        {loading ? "Adding..." : "Add assignment"}
      </Button>
      </div>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
