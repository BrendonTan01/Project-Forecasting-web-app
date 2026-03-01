"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProject, updateProject, type ProjectFormData } from "./actions";
import { Button, Card, Input, Select } from "@/components/ui/primitives";

type ProjectFormProps = {
  project?: {
    id: string;
    name: string;
    client_name?: string | null;
    estimated_hours?: number | null;
    start_date?: string | null;
    end_date?: string | null;
    status: string;
  };
};

export function ProjectForm({ project }: ProjectFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!project;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const data: ProjectFormData = {
      name: (formData.get("name") as string)?.trim() ?? "",
      client_name: (formData.get("client_name") as string)?.trim() || undefined,
      estimated_hours: formData.get("estimated_hours")
        ? parseFloat(formData.get("estimated_hours") as string)
        : undefined,
      start_date: (formData.get("start_date") as string) || undefined,
      end_date: (formData.get("end_date") as string) || undefined,
      status: (formData.get("status") as string) || "active",
    };

    if (!data.name) {
      setError("Project name is required");
      setSubmitting(false);
      return;
    }

    const result = isEdit
      ? await updateProject(project.id, data)
      : await createProject(data);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if ("id" in result && result.id) {
      router.push(`/projects/${result.id}`);
    } else if (isEdit) {
      router.push(`/projects/${project.id}`);
    } else {
      router.push("/projects");
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4"
    >
      <Card className="space-y-4 p-6">
      {error && (
        <p className="app-alert app-alert-error">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700">
          Project name *
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={project?.name}
          placeholder="e.g. Bridge Design Phase 1"
        />
      </div>

      <div>
        <label htmlFor="client_name" className="mb-1 block text-sm font-medium text-zinc-700">
          Client name
        </label>
        <Input
          id="client_name"
          name="client_name"
          type="text"
          defaultValue={project?.client_name ?? ""}
          placeholder="e.g. City Council"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="estimated_hours" className="mb-1 block text-sm font-medium text-zinc-700">
            Estimated hours
          </label>
          <Input
            id="estimated_hours"
            name="estimated_hours"
            type="number"
            min="0"
            step="0.5"
            defaultValue={project?.estimated_hours ?? ""}
            placeholder="e.g. 400"
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-zinc-700">
            Status
          </label>
          <Select
            id="status"
            name="status"
            defaultValue={project?.status ?? "active"}
          >
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="start_date" className="mb-1 block text-sm font-medium text-zinc-700">
            Start date
          </label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={project?.start_date ?? ""}
          />
        </div>
        <div>
          <label htmlFor="end_date" className="mb-1 block text-sm font-medium text-zinc-700">
            End date
          </label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={project?.end_date ?? ""}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Create project"}
        </Button>
        <Link
          href={isEdit ? `/projects/${project.id}` : "/projects"}
          className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm"
        >
          Cancel
        </Link>
      </div>
      </Card>
    </form>
  );
}
