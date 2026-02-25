"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProposal } from "../actions";

type DeleteProposalButtonProps = {
  proposalId: string;
  proposalName: string;
};

export function DeleteProposalButton({ proposalId, proposalName }: DeleteProposalButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteProposal(proposalId);
    if (result.error) {
      alert(result.error);
      setDeleting(false);
      return;
    }
    router.push("/proposals");
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-600">
          Delete &quot;{proposalName}&quot;?
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
    >
      Delete
    </button>
  );
}
