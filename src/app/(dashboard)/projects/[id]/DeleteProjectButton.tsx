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
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <span className="w-full text-sm text-zinc-600 sm:w-auto">
          Delete &quot;{projectName}&quot;?
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="app-btn app-btn-danger focus-ring w-full px-3 py-1.5 text-sm sm:w-auto"
        >
          {deleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="app-btn app-btn-secondary focus-ring w-full px-3 py-1.5 text-sm sm:w-auto"
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
