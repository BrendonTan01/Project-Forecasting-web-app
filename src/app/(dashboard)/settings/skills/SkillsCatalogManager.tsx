"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import type { SkillItem } from "@/app/api/skills/route";

type SkillsCatalogManagerProps = {
  initialSkills: SkillItem[];
};

type SkillDeleteImpact = {
  skill: SkillItem;
  staff: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; label: string }>;
  proposals: Array<{ id: string; label: string }>;
};

export default function SkillsCatalogManager({
  initialSkills,
}: SkillsCatalogManagerProps) {
  const [skills, setSkills] = useState<SkillItem[]>(initialSkills);
  const [newSkillName, setNewSkillName] = useState("");
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<SkillDeleteImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  const sortedSkills = useMemo(
    () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
    [skills]
  );

  const clearAlerts = () => {
    setError(null);
    setSuccess(null);
  };

  async function refreshSkills() {
    const res = await fetch("/api/skills");
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to refresh skills");
    }
    setSkills(data.skills ?? []);
  }

  async function createSkill() {
    const name = newSkillName.trim();
    if (!name) return;

    clearAlerts();
    setLoading(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create skill");
        return;
      }
      await refreshSkills();
      setNewSkillName("");
      setSuccess("Skill created.");
    } catch {
      setError("Failed to create skill");
    } finally {
      setLoading(false);
    }
  }

  async function saveSkill(skillId: string) {
    const name = editingName.trim();
    if (!name) return;

    clearAlerts();
    setLoading(true);
    try {
      const res = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: skillId, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update skill");
        return;
      }
      await refreshSkills();
      setEditingSkillId(null);
      setEditingName("");
      setSuccess("Skill updated.");
    } catch {
      setError("Failed to update skill");
    } finally {
      setLoading(false);
    }
  }

  async function openDeleteImpact(skillId: string) {
    clearAlerts();
    setImpactLoading(true);
    try {
      const res = await fetch(
        `/api/skills?impact_skill_id=${encodeURIComponent(skillId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load skill impact");
        return;
      }
      setDeleteImpact(data as SkillDeleteImpact);
    } catch {
      setError("Failed to load skill impact");
    } finally {
      setImpactLoading(false);
    }
  }

  async function deleteSkill(skillId: string) {
    clearAlerts();
    setLoading(true);
    try {
      const res = await fetch("/api/skills", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: skillId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete skill");
        return;
      }
      await refreshSkills();
      if (editingSkillId === skillId) {
        setEditingSkillId(null);
        setEditingName("");
      }
      setDeleteImpact(null);
      setSuccess(
        `Skill deleted. Removed from ${data.removed_from_staff_count ?? 0} staff profile(s) and ${data.removed_from_project_count ?? 0} project requirement(s).`
      );
    } catch {
      setError("Failed to delete skill");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Add skill</h2>
        <div className="flex gap-2">
          <Input
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
            placeholder="e.g. Data Engineering"
            disabled={loading}
          />
          <Button
            type="button"
            onClick={createSkill}
            disabled={loading || newSkillName.trim().length === 0}
          >
            Add
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Skill catalog</h2>
        {sortedSkills.length === 0 ? (
          <p className="text-sm text-zinc-600">No skills configured yet.</p>
        ) : (
          <ul className="space-y-2">
            {sortedSkills.map((skill) => {
              const isEditing = editingSkillId === skill.id;
              return (
                <li
                  key={skill.id}
                  className="flex items-center gap-2 rounded border border-zinc-200 p-2"
                >
                  {isEditing ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      disabled={loading}
                    />
                  ) : (
                    <div className="flex-1">
                      <p className="text-sm text-zinc-900">{skill.name}</p>
                      <p className="text-xs text-zinc-500">
                        Used by {skill.staff_count ?? 0} staff, {skill.project_count ?? 0} current projects
                      </p>
                    </div>
                  )}
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveSkill(skill.id)}
                        disabled={loading || editingName.trim().length === 0}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingSkillId(null);
                          setEditingName("");
                        }}
                        disabled={loading}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingSkillId(skill.id);
                          setEditingName(skill.name);
                        }}
                        disabled={loading}
                      >
                        Rename
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => openDeleteImpact(skill.id)}
                        disabled={loading || impactLoading}
                      >
                        {impactLoading && deleteImpact?.skill.id !== skill.id
                          ? "Loading..."
                          : "Delete"}
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {error && <p className="app-alert app-alert-error">{error}</p>}
      {success && <p className="app-alert app-alert-success">{success}</p>}

      {deleteImpact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto p-5">
            <h3 className="text-base font-semibold text-zinc-900">
              Delete &quot;{deleteImpact.skill.name}&quot;?
            </h3>
            <p className="mt-2 text-sm text-zinc-700">
              This skill will be removed from all linked records:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              <li>
                <span className="font-medium text-zinc-900">
                  Staff profiles:
                </span>{" "}
                {deleteImpact.staff.length}
              </li>
              <li>
                <span className="font-medium text-zinc-900">
                  Current project requirements:
                </span>{" "}
                {deleteImpact.projects.length}
              </li>
              <li>
                <span className="font-medium text-zinc-900">
                  Proposed project entries:
                </span>{" "}
                {deleteImpact.proposals.length}
              </li>
            </ul>

            {deleteImpact.staff.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Affected staff
                </p>
                <ul className="max-h-28 space-y-1 overflow-y-auto rounded border border-zinc-200 p-2 text-sm text-zinc-800">
                  {deleteImpact.staff.map((item) => (
                    <li key={item.id}>{item.label}</li>
                  ))}
                </ul>
              </div>
            )}

            {deleteImpact.projects.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Affected current projects
                </p>
                <ul className="max-h-28 space-y-1 overflow-y-auto rounded border border-zinc-200 p-2 text-sm text-zinc-800">
                  {deleteImpact.projects.map((item) => (
                    <li key={item.id}>{item.label}</li>
                  ))}
                </ul>
              </div>
            )}

            {deleteImpact.proposals.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Affected proposals
                </p>
                <ul className="max-h-28 space-y-1 overflow-y-auto rounded border border-zinc-200 p-2 text-sm text-zinc-800">
                  {deleteImpact.proposals.map((item) => (
                    <li key={item.id}>{item.label}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteImpact(null)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => deleteSkill(deleteImpact.skill.id)}
                disabled={loading}
              >
                {loading ? "Deleting..." : "Delete skill"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
