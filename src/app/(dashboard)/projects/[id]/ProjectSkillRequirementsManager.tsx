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

type RequirementInputUnit = "hours" | "people";

type ProjectSkillRequirementsManagerProps = {
  projectId: string;
  allSkills: SkillItem[];
  initialRequirements: RequirementRow[];
  canManage: boolean;
  peopleUnitHoursPerWeek: number;
  peopleUnitSource: "project_offices" | "tenant_default";
};

function makeRowKey(index: number, skillId: string): string {
  return `${index}-${skillId || "new"}`;
}

export default function ProjectSkillRequirementsManager({
  projectId,
  allSkills,
  initialRequirements,
  canManage,
  peopleUnitHoursPerWeek,
  peopleUnitSource,
}: ProjectSkillRequirementsManagerProps) {
  const [rows, setRows] = useState<EditableRequirementRow[]>(
    initialRequirements.map((row, index) => ({
      ...row,
      key: makeRowKey(index, row.skill_id),
    }))
  );
  const [savedSnapshot, setSavedSnapshot] = useState<RequirementRow[]>(initialRequirements);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inputUnit, setInputUnit] = useState<RequirementInputUnit>("hours");

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

  const inputStep = inputUnit === "hours" ? "0.5" : "0.1";
  const inputPlaceholder = inputUnit === "hours" ? "e.g. 12" : "e.g. 1.5";

  const toDisplayValue = (requiredHoursPerWeek: number): number => {
    if (inputUnit === "hours") {
      return requiredHoursPerWeek;
    }
    return Math.round((requiredHoursPerWeek / peopleUnitHoursPerWeek) * 100) / 100;
  };

  const toStoredHours = (inputValue: number): number => {
    if (inputUnit === "hours") {
      return inputValue;
    }
    return Math.round(inputValue * peopleUnitHoursPerWeek * 100) / 100;
  };

  const normalizeForCompare = (requirements: RequirementRow[]): string =>
    requirements
      .map((row) => `${row.skill_id}::${Number(row.required_hours_per_week ?? 0).toFixed(2)}`)
      .sort()
      .join("|");

  const hasUnsavedChanges =
    normalizeForCompare(
      rows.map((row) => ({
        skill_id: row.skill_id,
        required_hours_per_week: Number(row.required_hours_per_week ?? 0),
      }))
    ) !== normalizeForCompare(savedSnapshot);

  const savedHoursBySkill = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of savedSnapshot) {
      map.set(row.skill_id, Number(row.required_hours_per_week ?? 0));
    }
    return map;
  }, [savedSnapshot]);

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
      setSavedSnapshot(savedRows);
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
      <p className="text-xs text-zinc-600">
        Set skill demand per week. You can enter requirements in hours/week or people (1 person ={" "}
        {peopleUnitHoursPerWeek.toFixed(1)} hours/week).
        {" "}
        {peopleUnitSource === "project_offices"
          ? "This conversion is based on the average working hours of this project's selected offices."
          : "This conversion is using the organisation planning default because no project office scope is selected."}
      </p>
      {sortedSkills.length === 0 ? (
        <p className="text-sm text-zinc-600">No skills configured yet.</p>
      ) : canManage ? (
        <>
          <div className="max-w-xs">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Input unit
            </label>
            <Select
              value={inputUnit}
              onChange={(e) => setInputUnit(e.target.value as RequirementInputUnit)}
              disabled={loading}
            >
              <option value="hours">Hours/week</option>
              <option value="people">People</option>
            </Select>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-600">No requirements set yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                  Saved
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                  Pending save
                </span>
              </div>
              <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <div className="col-span-7">Skill</div>
                <div className="col-span-3">
                  {inputUnit === "hours" ? "Required hrs/week" : "Required people"}
                </div>
                <div className="col-span-2 text-right">Action</div>
              </div>
              {rows.map((row) => {
                const savedHours = savedHoursBySkill.get(row.skill_id);
                const isSavedRow =
                  Boolean(row.skill_id) &&
                  savedHours !== undefined &&
                  Math.abs(savedHours - Number(row.required_hours_per_week ?? 0)) < 0.01;
                return (
                <div
                  key={row.key}
                  className={`grid grid-cols-12 gap-2 rounded border p-2 ${
                    isSavedRow
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-amber-200 bg-amber-50/40"
                  }`}
                >
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
                      step={inputStep}
                      aria-label={
                        inputUnit === "hours"
                          ? "Required hours per week for selected skill"
                          : "Required people for selected skill"
                      }
                      placeholder={inputPlaceholder}
                      value={toDisplayValue(Number(row.required_hours_per_week ?? 0))}
                      onChange={(e) =>
                        updateRow(row.key, {
                          required_hours_per_week: toStoredHours(Number(e.target.value)),
                        })
                      }
                      disabled={loading}
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`text-center text-[10px] font-semibold uppercase tracking-wide ${
                          isSavedRow ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {isSavedRow ? "Saved" : "Pending"}
                      </span>
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
                </div>
              )})}
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
              disabled={loading || !hasUnsavedChanges}
            >
              {loading ? "Saving..." : "Save requirements"}
            </Button>
          </div>
          {hasUnsavedChanges && (
            <p className="text-xs font-medium text-amber-700">
              You have pending requirement changes that are not saved yet.
            </p>
          )}
          <p className="text-xs text-zinc-500">
            {inputUnit === "hours"
              ? "Example: if Design is set to 12, this project needs 12 design hours each week."
              : `Example: if Design is set to 1.5, this project needs 1.5 people (~${(
                  1.5 * peopleUnitHoursPerWeek
                ).toFixed(1)} hours/week) each week.`}
          </p>
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
                  {Number(row.required_hours_per_week).toFixed(1)} required hrs/week
                  {" "}
                  ({(Number(row.required_hours_per_week) / peopleUnitHoursPerWeek).toFixed(2)} people)
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
