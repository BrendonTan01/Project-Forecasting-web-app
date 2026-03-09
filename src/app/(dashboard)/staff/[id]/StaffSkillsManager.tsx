"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import type { SkillItem } from "@/app/api/skills/route";

type StaffSkillsManagerProps = {
  staffId: string;
  allSkills: SkillItem[];
  initialSkillIds: string[];
  canManage: boolean;
};

export default function StaffSkillsManager({
  staffId,
  allSkills,
  initialSkillIds,
  canManage,
}: StaffSkillsManagerProps) {
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(initialSkillIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedSkills = useMemo(
    () => [...allSkills].sort((a, b) => a.name.localeCompare(b.name)),
    [allSkills]
  );

  const selectedNameSet = useMemo(() => {
    const names = new Set<string>();
    const selectedSet = new Set(selectedSkillIds);
    for (const skill of allSkills) {
      if (selectedSet.has(skill.id)) {
        names.add(skill.name);
      }
    }
    return names;
  }, [allSkills, selectedSkillIds]);

  const toggleSkill = (skillId: string) => {
    if (!canManage || loading) return;
    setSelectedSkillIds((prev) =>
      prev.includes(skillId)
        ? prev.filter((id) => id !== skillId)
        : [...prev, skillId]
    );
  };

  const saveSkills = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch("/api/staff-skills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_id: staffId,
          skill_ids: selectedSkillIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update staff skills");
        return;
      }
      setSelectedSkillIds(data.skill_ids ?? selectedSkillIds);
      setSuccess("Staff skills updated.");
    } catch {
      setError("Failed to update staff skills");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {sortedSkills.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No skills configured yet.
        </p>
      ) : (
        <div className="space-y-2">
          {canManage ? (
            sortedSkills.map((skill) => (
              <label
                key={skill.id}
                className="flex cursor-pointer items-center gap-2 rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={selectedSkillIds.includes(skill.id)}
                  onChange={() => toggleSkill(skill.id)}
                  disabled={loading}
                />
                <span>{skill.name}</span>
              </label>
            ))
          ) : (
            <div className="flex flex-wrap gap-2">
              {[...selectedNameSet].map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                >
                  {name}
                </span>
              ))}
              {selectedNameSet.size === 0 && (
                <p className="text-sm text-zinc-600">No skills assigned.</p>
              )}
            </div>
          )}
        </div>
      )}

      {canManage && sortedSkills.length > 0 && (
        <Button
          type="button"
          size="sm"
          onClick={saveSkills}
          disabled={loading}
        >
          {loading ? "Saving..." : "Save skills"}
        </Button>
      )}

      {error && <p className="app-alert app-alert-error">{error}</p>}
      {success && <p className="app-alert app-alert-success">{success}</p>}
    </div>
  );
}
