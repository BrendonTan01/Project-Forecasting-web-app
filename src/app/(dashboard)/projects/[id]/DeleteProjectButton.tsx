"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProject } from "../actions";

type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
};

export function DeleteProjectButton({ projectId, projectName }: DeleteProjectButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteProject(projectId);
    if (result.error) {
      alert(result.error);
      setDeleting(false);
      return;
    }
    router.push("/projects");
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-600">
          Delete &quot;{projectName}&quot;?
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="app-btn app-btn-danger focus-ring px-3 py-1.5 text-sm"
        >
          {deleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="app-btn app-btn-danger focus-ring px-4 py-2 text-sm"
    >
      Delete
    </button>
  );
}
