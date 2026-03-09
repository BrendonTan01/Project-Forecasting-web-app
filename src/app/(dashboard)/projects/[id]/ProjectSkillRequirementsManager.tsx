"use client";

import { useMemo, useState } from "react";
import { Button, Input, Select } from "@/components/ui/primitives";
import type { SkillItem } from "@/app/api/skills/route";

type RequirementRow = {
  skill_id: string;
  required_hours_per_week: number;
};

type EditableRequirementRow = RequirementRow & {
  key: string;
};

type ProjectSkillRequirementsManagerProps = {
  projectId: string;
  allSkills: SkillItem[];
  initialRequirements: RequirementRow[];
  canManage: boolean;
};

function makeRowKey(index: number, skillId: string): string {
  return `${index}-${skillId || "new"}`;
}

export default function ProjectSkillRequirementsManager({
  projectId,
  allSkills,
  initialRequirements,
  canManage,
}: ProjectSkillRequirementsManagerProps) {
  const [rows, setRows] = useState<EditableRequirementRow[]>(
    initialRequirements.map((row, index) => ({
      ...row,
      key: makeRowKey(index, row.skill_id),
    }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedSkills = useMemo(
    () => [...allSkills].sort((a, b) => a.name.localeCompare(b.name)),
    [allSkills]
  );

  const skillNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const skill of allSkills) {
      map.set(skill.id, skill.name);
    }
    return map;
  }, [allSkills]);

  const addRow = () => {
    if (!canManage || loading) return;
    setRows((prev) => [
      ...prev,
      {
        key: makeRowKey(prev.length + 1, ""),
        skill_id: "",
        required_hours_per_week: 0,
      },
    ]);
  };

  const updateRow = (key: string, patch: Partial<EditableRequirementRow>) => {
    if (!canManage || loading) return;
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (key: string) => {
    if (!canManage || loading) return;
    setRows((prev) => prev.filter((row) => row.key !== key));
  };

  const saveRequirements = async () => {
    setError(null);
    setSuccess(null);
    const payloadRequirements = rows.map((row) => ({
      skill_id: row.skill_id,
      required_hours_per_week: Number(row.required_hours_per_week ?? 0),
    }));

    if (payloadRequirements.some((row) => !row.skill_id)) {
      setError("Every row must have a selected skill.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/project-skill-requirements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          requirements: payloadRequirements,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update project skill requirements");
        return;
      }
      const savedRows = (data.requirements ?? []) as RequirementRow[];
      setRows(
        savedRows.map((row, index) => ({
          ...row,
          key: makeRowKey(index, row.skill_id),
        }))
      );
      setSuccess("Project skill requirements updated.");
    } catch {
      setError("Failed to update project skill requirements");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {sortedSkills.length === 0 ? (
        <p className="text-sm text-zinc-600">No skills configured yet.</p>
      ) : canManage ? (
        <>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-600">No requirements set yet.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.key} className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <Select
                      value={row.skill_id}
                      onChange={(e) =>
                        updateRow(row.key, { skill_id: e.target.value })
                      }
                      disabled={loading}
                    >
                      <option value="">Select skill</option>
                      {sortedSkills.map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={row.required_hours_per_week}
                      onChange={(e) =>
                        updateRow(row.key, {
                          required_hours_per_week: Number(e.target.value),
                        })
                      }
                      disabled={loading}
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      className="w-full"
                      onClick={() => removeRow(row.key)}
                      disabled={loading}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addRow}
              disabled={loading}
            >
              Add skill requirement
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveRequirements}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save requirements"}
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-600">No requirements set.</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2"
              >
                <span className="text-sm text-zinc-900">
                  {skillNameById.get(row.skill_id) ?? "Unknown skill"}
                </span>
                <span className="text-sm font-medium text-zinc-800">
                  {Number(row.required_hours_per_week).toFixed(1)}h/week
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {error && <p className="app-alert app-alert-error">{error}</p>}
      {success && <p className="app-alert app-alert-success">{success}</p>}
    </div>
  );
}
