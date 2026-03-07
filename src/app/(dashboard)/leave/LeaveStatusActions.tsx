"use client";

import { useState } from "react";
import { updateLeaveRequestStatus, deleteLeaveRequest } from "./actions";

export function ApproveRejectButtons({
  leaveRequestId,
  currentStatus,
}: {
  leaveRequestId: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "approved" | "rejected") {
    setLoading(true);
    setError(null);
    const result = await updateLeaveRequestStatus(leaveRequestId, action);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  if (currentStatus !== "pending") return null;

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => handleAction("approved")}
        disabled={loading}
        className="text-sm font-medium text-emerald-600 hover:text-emerald-800"
      >
        Approve
      </button>
      <button
        onClick={() => handleAction("rejected")}
        disabled={loading}
        className="text-sm font-medium text-red-600 hover:text-red-800"
      >
        Reject
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function DeleteLeaveButton({
  leaveRequestId,
}: {
  leaveRequestId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const result = await deleteLeaveRequest(leaveRequestId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="text-zinc-700">Delete this request?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="font-medium text-red-600 hover:text-red-800"
        >
          {loading ? "Deleting..." : "Confirm"}
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
      Delete
    </button>
  );
}
