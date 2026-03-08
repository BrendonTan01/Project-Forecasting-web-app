"use client";

import { useState } from "react";
import { removeProjectAssignment } from "./actions";

export default function RemoveAssignmentButton({
  projectId,
  assignmentId,
  staffEmail,
}: {
  projectId: string;
  assignmentId: string;
  staffEmail: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setLoading(true);
    setError(null);
    const result = await removeProjectAssignment(projectId, assignmentId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="text-zinc-700">Remove {staffEmail}?</span>
        <button
          onClick={handleRemove}
          disabled={loading}
          className="font-medium text-red-600 hover:text-red-800"
        >
          {loading ? "Removing..." : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-zinc-500 hover:text-zinc-700"
        >
          Cancel
        </button>
        {error && <span className="text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm text-zinc-500 hover:text-red-600"
    >
      Remove
    </button>
  );
}
